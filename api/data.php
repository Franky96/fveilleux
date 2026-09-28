<?php
define('_FVEILLEUX', 1);
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/session.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

$session = requireLogin();
$method  = $_SERVER['REQUEST_METHOD'];
$role    = $session['role'] ?? '';
$perms   = is_array($session['permissions'] ?? null) ? $session['permissions'] : [];
$isAdmin = $role === 'admin';
$isGuest = $role === 'guest' || ($session['uid'] ?? '') === 'guest';

/*
 * Chaque document de données appartient à une section du site.
 * Le serveur vérifie la permission de la section : cacher la page dans le
 * navigateur ne suffit pas, n'importe qui peut appeler l'API directement.
 */
const SECTIONS = [
  'donnees' => [
    'rona_global'     => 'rona',
    'ena_global'      => 'ena',
    'aviation_global' => 'aviation',
    'liens_global'    => 'liens',
    'films_global'    => 'films',
  ],
];

function sectionOf(string $col, string $id): ?string {
  return SECTIONS[$col][$id] ?? null;
}

// Lecture : admin, ou permission de la section. La config système (sections
// archivées, permissions invité) est lisible par toute personne connectée.
function canRead(string $col, string $id): bool {
  global $isAdmin, $perms;
  if ($isAdmin) return true;
  if ($col === 'systeme') return $id === 'config';
  $sec = sectionOf($col, $id);
  return $sec !== null && in_array($sec, $perms, true);
}

// Écriture : admin, ou compte (pas invité) ayant la permission de la section.
// Le compte invité est en lecture seule.
function canWrite(string $col, string $id): bool {
  global $isAdmin, $isGuest, $perms;
  if ($isAdmin) return true;
  if ($isGuest || $col === 'systeme') return false;
  $sec = sectionOf($col, $id);
  return $sec !== null && in_array($sec, $perms, true);
}

/* ══════════════ GET — lecture ══════════════ */
if ($method === 'GET') {
  $col = (string)($_GET['col'] ?? '');
  $id  = (string)($_GET['id']  ?? '');
  if ($col === '') errOut('Collection manquante');

  $pdo = getPDO();

  if ($id !== '') {
    if (!canRead($col, $id)) errOut('Accès refusé', 403);
    $stmt = $pdo->prepare('SELECT data FROM documents WHERE collection_name=? AND doc_id=?');
    $stmt->execute([$col, $id]);
    $row = $stmt->fetch();
    if (!$row) jsonOut(['exists' => false, 'data' => null]);
    jsonOut(['exists' => true, 'data' => json_decode($row['data'], true)]);
  }

  // Liste complète d'une collection : administrateur seulement
  if (!$isAdmin) errOut('Accès refusé', 403);
  $stmt = $pdo->prepare('SELECT doc_id, data FROM documents WHERE collection_name=? ORDER BY created_at ASC');
  $stmt->execute([$col]);
  $docs = array_map(fn($r) => ['id' => $r['doc_id'], 'data' => json_decode($r['data'], true)], $stmt->fetchAll());
  jsonOut(['docs' => $docs]);
}

/* ══════════════ POST — écriture ══════════════ */
if ($method === 'POST') {
  $input  = json_decode(file_get_contents('php://input'), true) ?? [];
  $action = (string)($input['action'] ?? '');
  $col    = (string)($input['col']    ?? '');
  $id     = (string)($input['id']     ?? '');
  $data   = $input['data'] ?? [];

  if ($col === '') errOut('Collection manquante');
  if (!is_array($data)) errOut('Données invalides');

  $pdo = getPDO();

  switch ($action) {

    case 'set':
      if ($id === '') errOut('ID manquant');
      if (!canWrite($col, $id)) errOut('Accès refusé', 403);
      $pdo->prepare('INSERT INTO documents (collection_name,doc_id,data) VALUES(?,?,?) ON DUPLICATE KEY UPDATE data=VALUES(data),updated_at=NOW()')
          ->execute([$col, $id, json_encode($data)]);
      jsonOut(['ok' => true]);

    case 'merge':
      if ($id === '') errOut('ID manquant');
      if (!canWrite($col, $id)) errOut('Accès refusé', 403);
      $stmt = $pdo->prepare('SELECT data FROM documents WHERE collection_name=? AND doc_id=?');
      $stmt->execute([$col, $id]);
      $row     = $stmt->fetch();
      $current = $row ? json_decode($row['data'], true) : [];
      $merged  = array_replace_recursive($current, $data);
      $pdo->prepare('INSERT INTO documents (collection_name,doc_id,data) VALUES(?,?,?) ON DUPLICATE KEY UPDATE data=VALUES(data),updated_at=NOW()')
          ->execute([$col, $id, json_encode($merged)]);
      jsonOut(['ok' => true]);

    case 'update':
      if ($id === '') errOut('ID manquant');
      if (!canWrite($col, $id)) errOut('Accès refusé', 403);
      $stmt = $pdo->prepare('SELECT data FROM documents WHERE collection_name=? AND doc_id=?');
      $stmt->execute([$col, $id]);
      $row     = $stmt->fetch();
      $current = $row ? json_decode($row['data'], true) : [];
      foreach ($data as $key => $value) {
        if (is_array($value) && isset($value['__op'])) {
          match ($value['__op']) {
            'arrayUnion'  => (function() use (&$current, $key, $value) {
              $arr = $current[$key] ?? [];
              foreach ($value['items'] as $item) { if (!in_array($item, $arr, true)) $arr[] = $item; }
              $current[$key] = array_values($arr);
            })(),
            'arrayRemove' => ($current[$key] = array_values(array_filter($current[$key] ?? [], fn($i) => !in_array($i, $value['items'], true)))),
            'increment'   => ($current[$key] = ($current[$key] ?? 0) + $value['n']),
            'delete'      => (function() use (&$current, $key) { unset($current[$key]); })(),
            default       => null,
          };
        } else {
          dotSet($current, (string)$key, $value);
        }
      }
      $pdo->prepare('INSERT INTO documents (collection_name,doc_id,data) VALUES(?,?,?) ON DUPLICATE KEY UPDATE data=VALUES(data),updated_at=NOW()')
          ->execute([$col, $id, json_encode($current)]);
      jsonOut(['ok' => true]);

    // Création et suppression de documents : administrateur seulement
    case 'add':
      if (!$isAdmin) errOut('Accès refusé', 403);
      $newId = bin2hex(random_bytes(10));
      $pdo->prepare('INSERT INTO documents (collection_name,doc_id,data) VALUES(?,?,?)')
          ->execute([$col, $newId, json_encode($data)]);
      jsonOut(['ok' => true, 'id' => $newId]);

    case 'delete':
      if ($id === '') errOut('ID manquant');
      if (!$isAdmin) errOut('Accès refusé', 403);
      $pdo->prepare('DELETE FROM documents WHERE collection_name=? AND doc_id=?')->execute([$col, $id]);
      jsonOut(['ok' => true]);

    // Requête filtrée : administrateur seulement. Les noms de champs sont
    // validés et passés en paramètres (plus d'injection SQL possible).
    case 'query':
      if (!$isAdmin) errOut('Accès refusé', 403);
      $wheres = is_array($input['where'] ?? null) ? $input['where'] : [];
      $order  = is_array($input['orderBy'] ?? null) ? $input['orderBy'] : null;
      $sql    = 'SELECT doc_id, data FROM documents WHERE collection_name=?';
      $params = [$col];
      $ops    = ['==' => '=', '!=' => '!=', '>' => '>', '<' => '<'];
      foreach ($wheres as $w) {
        if (!is_array($w) || count($w) !== 3) errOut('Filtre invalide');
        [$field, $op, $val] = $w;
        if (!isset($ops[$op])) errOut('Opérateur invalide');
        $sql .= " AND JSON_EXTRACT(data, ?) {$ops[$op]} ?";
        $params[] = jsonPath((string)$field);
        $params[] = in_array($op, ['==', '!='], true) ? json_encode($val) : $val;
      }
      if ($order) {
        $dir  = ($order[1] ?? 'asc') === 'desc' ? 'DESC' : 'ASC';
        $sql .= " ORDER BY JSON_EXTRACT(data, ?) $dir";
        $params[] = jsonPath((string)($order[0] ?? ''));
      }
      $stmt = $pdo->prepare($sql);
      $stmt->execute($params);
      $docs = array_map(fn($r) => ['id' => $r['doc_id'], 'data' => json_decode($r['data'], true)], $stmt->fetchAll());
      jsonOut(['docs' => $docs]);

    default:
      errOut('Action inconnue');
  }
}

errOut('Méthode non autorisée', 405);

function jsonPath(string $field): string {
  if (!preg_match('/^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$/', $field)) errOut('Champ invalide');
  return '$.' . $field;
}

function dotSet(array &$arr, string $key, $value): void {
  $parts   = explode('.', $key);
  $current = &$arr;
  for ($i = 0; $i < count($parts) - 1; $i++) {
    if (!isset($current[$parts[$i]]) || !is_array($current[$parts[$i]])) $current[$parts[$i]] = [];
    $current = &$current[$parts[$i]];
  }
  $current[end($parts)] = $value;
}
