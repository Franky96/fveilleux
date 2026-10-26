<?php
/*
 * Élections générales en Nouvelle-Zélande du 7 novembre 2026 (page « En direct ») : relais des résultats préliminaires de la
 * Commission électorale (Electoral Commission | Te Kaitiaki Take Kōwhiri).
 *
 * La Commission publie le soir du vote un flux XML (sans en-tête CORS : le navigateur ne peut pas le lire directement) :
 * election.xml (voix de parti et sièges projetés par parti), e01.xml à e71.xml (voix de parti et de candidat par circonscription,
 * bureaux dépouillés), parties.xml, candidates.xml, electorates.xml (listes). Adresse donnée aux médias dans la trousse de 2026 :
 * media.election.net.nz/xml/ ; même flux sur www.electionresults.govt.nz/xml/ (déjà en ligne avant le vote, voix à zéro).
 * Le serveur lit tous ces fichiers (en parallèle), les garde en cache 45 s et les rend tels quels dans « fichiers ».
 * L'interprétation se fait dans en-direct/nouvelle-zelande/direct.js, qui lit aussi la copie du pipeline
 * (en-direct/nouvelle-zelande/resultats.json, même forme, écrite par en-direct/nouvelle-zelande/outils/nz.py) si ce relais ne répond pas.
 *
 *   ?type=resultats          cache 45 s
 *   &listes=0                sans parties.xml, candidates.xml, electorates.xml (déjà lus par la page)
 *   &demo=2023               résultats officiels de 2023, même format (archive de la Commission), cache 1 jour
 *   &demo=simulation         simulation de la Commission pour les médias (mediademo), cache 45 s
 *
 * Seuls les hôtes de la Commission électorale sont lus : aucune adresse fournie par le visiteur n'est appelée.
 */
define('_FVEILLEUX', 1);
require_once __DIR__ . '/session.php';
function errOut(string $msg, int $status = 400): never {
  http_response_code($status); header('Content-Type: application/json; charset=utf-8');
  echo json_encode(['error' => $msg], JSON_UNESCAPED_UNICODE); exit;
}

$s = getSession();
if (!$s) errOut('Non authentifié', 401);
$role  = $s['role'] ?? '';
$perms = normaliserPermissions($s['permissions'] ?? []);
if ($role !== 'admin' && !in_array('votes-quebec', $perms, true)) errOut('Accès refusé', 403);
if (($_GET['type'] ?? 'resultats') !== 'resultats') errOut('Type inconnu', 400);

const SOURCES = [
  'direct'     => ['https://media.election.net.nz/xml/', 'https://www.electionresults.govt.nz/xml/'],
  '2023'       => ['https://archive.electionresults.govt.nz/electionresults_2023/xml/'],
  'simulation' => ['https://mediademo.electionresults.govt.nz/xml/'],
];
const LISTES = ['parties.xml', 'candidates.xml', 'electorates.xml'];
$demo = (string)($_GET['demo'] ?? '');
$cle  = isset(SOURCES[$demo]) && $demo !== 'direct' ? $demo : 'direct';
$ttl  = $cle === '2023' ? 86400 : 45;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$cache = sys_get_temp_dir() . '/fv_nz_resultats_' . $cle . '_v1.json';
$age   = is_file($cache) ? time() - filemtime($cache) : PHP_INT_MAX;

function poignee(string $url) {
  $c = curl_init($url);
  curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_CONNECTTIMEOUT => 6, CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_ENCODING => '', CURLOPT_USERAGENT => 'fveilleux.com (resultats en direct)', CURLOPT_HTTPHEADER => ['Accept: application/xml,text/xml']]);
  return $c;
}
// lit plusieurs fichiers en parallèle ; garde seulement les réponses 200 qui sont du XML (espaces entre balises retirées)
function lirePlusieurs(array $urls): array {
  $m = curl_multi_init(); $h = [];
  foreach ($urls as $nom => $u) { $h[$nom] = poignee($u); curl_multi_add_handle($m, $h[$nom]); }
  do { $st = curl_multi_exec($m, $actifs); if ($actifs) curl_multi_select($m, 1.0); } while ($actifs && $st === CURLM_OK);
  $out = [];
  foreach ($h as $nom => $c) {
    $corps = (string)curl_multi_getcontent($c);
    if ((int)curl_getinfo($c, CURLINFO_RESPONSE_CODE) === 200 && str_starts_with(ltrim($corps), '<?xml')) $out[$nom] = preg_replace('/>\s+</', '><', trim($corps));
    curl_multi_remove_handle($m, $c); curl_close($c);
  }
  curl_multi_close($m);
  return $out;
}
function lireSource(string $base): array {
  $f = lirePlusieurs(array_merge(['election.xml' => $base . 'election.xml'], array_combine(LISTES, array_map(fn($n) => $base . $n, LISTES))));
  if (!isset($f['election.xml'])) return [];
  $nums = [];
  if (isset($f['electorates.xml']) && preg_match_all('/e_no="(\d+)"/', $f['electorates.xml'], $m)) $nums = array_map('intval', $m[1]);
  if (!$nums) $nums = range(1, 71);
  $urls = [];
  foreach (array_slice(array_unique($nums), 0, 80) as $n) { $e = sprintf('e%02d', $n); $urls[$e . '.xml'] = $base . $e . '/' . $e . '.xml'; }
  return $f + lirePlusieurs($urls);
}

if ($age > $ttl) {
  $verrou = fopen($cache . '.lock', 'c');
  if ($verrou && flock($verrou, LOCK_EX | LOCK_NB)) {          // un seul téléchargement à la fois
    $fichiers = []; $source = null;
    foreach (SOURCES[$cle] as $base) { $fichiers = lireSource($base); if ($fichiers) { $source = $base; break; } }
    $d = ['disponible' => count($fichiers) > 0, 'maj' => date('c'), 'source' => $source ?? SOURCES[$cle][0], 'fichiers' => (object)$fichiers];
    if ($cle !== 'direct') $d['demo'] = $cle;
    if ($fichiers || !is_file($cache)) file_put_contents($cache, json_encode($d, JSON_UNESCAPED_UNICODE), LOCK_EX);
    $age = 0;
    flock($verrou, LOCK_UN);
  }
  if ($verrou) fclose($verrou);
}

if (!is_file($cache)) { http_response_code(503); exit(json_encode(['disponible' => false, 'erreur' => 'La Commission électorale ne répond pas pour le moment.'], JSON_UNESCAPED_UNICODE)); }
$donnees = json_decode((string)file_get_contents($cache), true) ?: ['disponible' => false];
if (($_GET['listes'] ?? '1') === '0' && isset($donnees['fichiers'])) foreach (LISTES as $n) unset($donnees['fichiers'][$n]);
if (isset($donnees['fichiers']) && !$donnees['fichiers']) $donnees['fichiers'] = new stdClass();
$donnees['ageCache'] = $age === PHP_INT_MAX ? null : $age;
echo json_encode($donnees, JSON_UNESCAPED_UNICODE);
