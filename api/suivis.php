<?php
/*
 * Circonscriptions suivies (Votes Québec, onglet « En direct »), par compte.
 *
 * Les comptes connectés retrouvent leurs suivis sur tous leurs appareils ; l'invité garde les siens
 * dans son navigateur seulement (refusé ici). Un document par compte : collection interne « _suivis »
 * (jamais servie par data.php), doc_id = identifiant du compte.
 *
 *   GET            → { exists, data: { suivis: { PQ: [noms…], … }, maj } }
 *   POST {suivis}  → remplace les suivis du compte
 */
define('_FVEILLEUX', 1);
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/session.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$s    = requireLogin();
$uid  = (string)($s['uid'] ?? '');
$role = $s['role'] ?? '';
if ($uid === '' || $uid === 'guest' || $role === 'guest') errOut('Réservé aux comptes connectés', 403);
$perms = normaliserPermissions($s['permissions'] ?? []);
if ($role !== 'admin' && !in_array('votes-quebec', $perms, true)) errOut('Accès refusé', 403);

const PARTIS = ['PQ', 'PLQ', 'CAQ', 'PCQ', 'QS'];
$pdo = getPDO();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  $stmt = $pdo->prepare('SELECT data FROM documents WHERE collection_name=? AND doc_id=?');
  $stmt->execute(['_suivis', $uid]);
  $row = $stmt->fetch();
  jsonOut($row ? ['exists' => true, 'data' => json_decode($row['data'], true)] : ['exists' => false, 'data' => null]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $in = json_decode(file_get_contents('php://input'), true);
  if (!is_array($in) || !is_array($in['suivis'] ?? null)) errOut('Données invalides');
  // seulement les 5 partis, des noms de circonscription (texte court), au plus 127 par parti
  $propre = [];
  foreach (PARTIS as $p) {
    $liste = $in['suivis'][$p] ?? [];
    if (!is_array($liste)) continue;
    $noms = [];
    foreach ($liste as $n) if (is_string($n) && $n !== '' && mb_strlen($n) <= 80) $noms[] = $n;
    $noms = array_slice(array_values(array_unique($noms)), 0, 127);
    if ($noms) $propre[$p] = $noms;
  }
  $data = ['suivis' => (object)$propre, 'maj' => date('c')];
  $pdo->prepare('INSERT INTO documents (collection_name,doc_id,data) VALUES(?,?,?) ON DUPLICATE KEY UPDATE data=VALUES(data),updated_at=NOW()')
      ->execute(['_suivis', $uid, json_encode($data, JSON_UNESCAPED_UNICODE)]);
  jsonOut(['ok' => true]);
}

errOut('Méthode non autorisée', 405);
