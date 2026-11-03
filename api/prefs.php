<?php
/*
 * Préférences de chaque compte (tableau de bord 2.0) : ses raccourcis, dans l'ordre choisi.
 * Stockés dans la table documents, collection « _prefs » (jamais servie par data.php), un document par compte.
 * Le compte invité n'a pas de raccourcis.
 *   GET            → { raccourcis: [pages] | null }   (null : jamais personnalisé, la page prend les raccourcis par défaut)
 *   POST { action: "raccourcis", raccourcis: [pages] } → { ok: true }
 */
define('_FVEILLEUX', 1);
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/session.php';

header('Cache-Control: no-store');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

$s = requireLogin();
$uid = (string)($s['uid'] ?? '');
if ($uid === '' || $uid === 'guest' || ($s['role'] ?? '') === 'guest') errOut('Pas de raccourcis pour le compte invité', 403);

$pdo = getPDO();
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  $q = $pdo->prepare('SELECT data FROM documents WHERE collection_name=? AND doc_id=?');
  $q->execute(['_prefs', $uid]);
  $r = $q->fetch();
  $d = $r ? (json_decode($r['data'], true) ?: []) : [];
  jsonOut(['raccourcis' => isset($d['raccourcis']) && is_array($d['raccourcis']) ? $d['raccourcis'] : null]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') errOut('Méthode non autorisée', 405);
$in = json_decode(file_get_contents('php://input'), true);
if (!is_array($in) || ($in['action'] ?? '') !== 'raccourcis' || !is_array($in['raccourcis'] ?? null)) errOut('Requête invalide');
$liste = [];
foreach ($in['raccourcis'] as $p) {
  // une page du site : nom de fichier .html, au plus un sous-dossier (ex. concept/index.html)
  if (is_string($p) && preg_match('#^[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)?\.html$#', $p) && !in_array($p, $liste, true)) $liste[] = $p;
}
$liste = array_slice($liste, 0, 8);
$json = json_encode(['raccourcis' => $liste]);
$q = $pdo->prepare('SELECT 1 FROM documents WHERE collection_name=? AND doc_id=?');
$q->execute(['_prefs', $uid]);
if ($q->fetch()) $pdo->prepare('UPDATE documents SET data=? WHERE collection_name=? AND doc_id=?')->execute([$json, '_prefs', $uid]);
else $pdo->prepare('INSERT INTO documents (collection_name, doc_id, data) VALUES (?, ?, ?)')->execute(['_prefs', $uid, $json]);
jsonOut(['ok' => true]);
