<?php
define('_FVEILLEUX', 1);
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/session.php';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

$session = requireLogin();
$method  = $_SERVER['REQUEST_METHOD'];

/* ══════════════ GET — lecture ══════════════ */
if ($method === 'GET') {
  $col = $_GET['col'] ?? '';
  $id  = $_GET['id']  ?? '';
  if (!$col) errOut('Collection manquante');

  // Lecture systeme uniquement admin (sauf config pour les invités)
  if ($col === 'systeme' && $id !== 'config' && $session['role'] !== 'admin') {
    errOut('Accès refusé', 403);
  }

  $pdo = getPDO();

  if ($id !== '') {
    $stmt = $pdo->prepare('SELECT data FROM documents WHERE collection_name=? AND doc_id=?');
    $stmt->execute([$col, $id]);
    $row = $stmt->fetch();
    if (!$row) jsonOut(['exists' => false, 'data' => null]);
    jsonOut(['exists' => true, 'data' => json_decode($row['data'], true)]);
  } else {
    $stmt = $pdo->prepare('SELECT doc_id, data FROM documents WHERE collection_name=? ORDER BY created_at ASC');
    $stmt->execute([$col]);
    $docs = array_map(fn($r) => ['id' => $r['doc_id'], 'data' => json_decode($r['data'], true)], $stmt->fetchAll());
    jsonOut(['docs' => $docs]);
  }
}

/* ══════════════ POST — écriture ══════════════ */
if ($method === 'POST') {
  $input  = json_decode(file_get_contents('php://input'), true) ?? [];
  $action = $input['action'] ?? '';
  $col    = $input['col']    ?? '';
  $id     = $input['id']     ?? '';
  $data   = $input['data']   ?? [];

  if (!$col) errOut('Collection manquante');

  // Écriture systeme uniquement admin
  if ($col === 'systeme' && $session['role'] !== 'admin') errOut('Accès refusé', 403);

  $pdo = getPDO();

  switch ($action) {

    case 'set':
      if ($id === '') errOut('ID manquant');
      $pdo->prepare('INSERT INTO documents (collection_name,doc_id,data) VALUES(?,?,?) ON DUPLICATE KEY UPDATE data=VALUES(data),updated_at=NOW()')
          ->execute([$col, $id, json_encode($data)]);
      jsonOut(['ok' => true]);

    case 'merge':
      if ($id === '') errOut('ID manquant');
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
          dotSet($current, $key, $value);
        }
      }
      $pdo->prepare('INSERT INTO documents (collection_name,doc_id,data) VALUES(?,?,?) ON DUPLICATE KEY UPDATE data=VALUES(data),updated_at=NOW()')
          ->execute([$col, $id, json_encode($current)]);
      jsonOut(['ok' => true]);

    case 'add':
      $newId = bin2hex(random_bytes(10));
      $pdo->prepare('INSERT INTO documents (collection_name,doc_id,data) VALUES(?,?,?)')
          ->execute([$col, $newId, json_encode($data)]);
      jsonOut(['ok' => true, 'id' => $newId]);

    case 'delete':
      if ($id === '') errOut('ID manquant');
      $pdo->prepare('DELETE FROM documents WHERE collection_name=? AND doc_id=?')->execute([$col, $id]);
      jsonOut(['ok' => true]);

    case 'query':
      $wheres = $input['where']   ?? [];
      $order  = $input['orderBy'] ?? null;
      $sql    = 'SELECT doc_id, data FROM documents WHERE collection_name=?';
      $params = [$col];
      foreach ($wheres as [$field, $op, $val]) {
        $path = '$.`' . str_replace('`', '', $field) . '`';
        match ($op) {
          '=='    => ($sql .= " AND JSON_EXTRACT(data,'$path')=?") && ($params[] = json_encode($val)),
          '!='    => ($sql .= " AND JSON_EXTRACT(data,'$path')!=?") && ($params[] = json_encode($val)),
          '>'     => ($sql .= " AND JSON_EXTRACT(data,'$path')>?") && ($params[] = $val),
          '<'     => ($sql .= " AND JSON_EXTRACT(data,'$path')<?") && ($params[] = $val),
          default => null,
        };
      }
      if ($order) {
        $dir  = ($order[1] ?? 'asc') === 'desc' ? 'DESC' : 'ASC';
        $sql .= " ORDER BY JSON_EXTRACT(data,'$.`" . str_replace('`', '', $order[0]) . "`') $dir";
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

function dotSet(array &$arr, string $key, $value): void {
  $parts   = explode('.', $key);
  $current = &$arr;
  for ($i = 0; $i < count($parts) - 1; $i++) {
    if (!isset($current[$parts[$i]]) || !is_array($current[$parts[$i]])) $current[$parts[$i]] = [];
    $current = &$current[$parts[$i]];
  }
  $current[end($parts)] = $value;
}
