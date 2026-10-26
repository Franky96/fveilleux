<?php
/*
 * Mi-mandat aux États-Unis du 3 novembre 2026 (page « En direct ») : relais des résultats du soir du vote.
 *
 * Source : les flux de résultats de CNN (politics.api.cnn.io/results/national-races/<année>-<type>.json : HG Chambre,
 * SG Sénat, GG gouverneurs ; votes de chaque candidat, % du vote dépouillé, appels des courses). Ils envoient déjà
 * Access-Control-Allow-Origin: * : la page peut les lire directement si ce relais ne répond pas ; le relais sert de cache
 * commun (30 s) et allège les données (seulement les champs utiles). Copie de secours du pipeline :
 * en-direct/etats-unis/resultats.json (en-direct/etats-unis/outils/usa.py, même forme).
 *
 *   ?annee=2026   (2024 : démo de la page, résultats de l'élection de 2024 au même format)
 *
 * Seules ces adresses fixes sont lues : aucune adresse fournie par le visiteur n'est appelée.
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
$annee = $_GET['annee'] ?? '2026';
if (!in_array($annee, ['2026', '2024'], true)) errOut('Année inconnue', 400);

const TTL = 30;
const TYPES = ['HG', 'SG', 'GG'];

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$cache = sys_get_temp_dir() . "/fv_usa_resultats_{$annee}_v1.json";
$age   = is_file($cache) ? time() - filemtime($cache) : PHP_INT_MAX;

function lireCnn(string $url): ?array {
  $c = curl_init($url);
  curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20, CURLOPT_FOLLOWLOCATION => false, CURLOPT_ENCODING => '',
    CURLOPT_USERAGENT => 'fveilleux.com (resultats en direct)', CURLOPT_HTTPHEADER => ['Accept: application/json']]);
  $corps = (string)curl_exec($c); $code = (int)curl_getinfo($c, CURLINFO_RESPONSE_CODE); curl_close($c);
  if ($code !== 200) return null;
  $d = json_decode($corps, true);
  return is_array($d) ? $d : null;
}
// seulement les champs dont la page a besoin
function alleger(array $r): array {
  $e = $r['raceEmbargo'] ?? [];
  return ['k' => $r['ecKey'] ?? '', 'st' => $r['stateAbbreviation'] ?? '', 'type' => $r['electionType'] ?? '', 'statut' => $r['status'] ?? '',
    'pct' => $r['percentReporting'] ?? null, 'total' => $r['totalVote'] ?? null, 'appel' => $r['editorialStatus'] ?? '',
    'ferme' => $e['pollsClosed'] ?? null, 'fermeture' => $e['assignedPollsClose'] ?? null, 'maj' => $r['voteTimestamp'] ?? null,
    'cands' => array_map(fn($c) => ['nom' => $c['fullName'] ?? '', 'p' => $c['candidatePartyCode'] ?? '', 'v' => $c['voteNum'] ?? 0,
      'g' => !empty($c['winner']), 'sortant' => !empty($c['isIncumbent']), 'tour2' => !empty($c['runoffCandidate'])], $r['candidates'] ?? [])];
}

if ($age > TTL) {
  $verrou = fopen($cache . '.lock', 'c');
  if ($verrou && flock($verrou, LOCK_EX | LOCK_NB)) {          // un seul téléchargement à la fois
    $courses = []; $lus = 0;
    foreach (TYPES as $t) {
      $d = lireCnn("https://politics.api.cnn.io/results/national-races/{$annee}-{$t}.json");
      if ($d === null) continue;
      $lus++;
      // élection générale seulement (le flux de l'année contient aussi les primaires et les élections spéciales passées)
      $courses[$t] = array_values(array_map('alleger', array_filter($d, fn($r) => ($r['electionType'] ?? 'G') === 'G')));
    }
    $d = ['disponible' => $lus > 0, 'maj' => date('c'), 'annee' => $annee, 'source' => 'politics.api.cnn.io', 'courses' => $courses];
    if ($lus || !is_file($cache)) file_put_contents($cache, json_encode($d, JSON_UNESCAPED_UNICODE), LOCK_EX);
    $age = 0;
    flock($verrou, LOCK_UN);
  }
  if ($verrou) fclose($verrou);
}

if (!is_file($cache)) { http_response_code(503); exit(json_encode(['disponible' => false, 'erreur' => 'Les résultats ne répondent pas pour le moment.'], JSON_UNESCAPED_UNICODE)); }
$donnees = json_decode((string)file_get_contents($cache), true) ?: ['disponible' => false];
$donnees['ageCache'] = $age === PHP_INT_MAX ? null : $age;
echo json_encode($donnees, JSON_UNESCAPED_UNICODE);
