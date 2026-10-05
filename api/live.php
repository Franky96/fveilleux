<?php
/*
 * Résultats électoraux en direct (Votes Québec, onglet « En direct »).
 *
 * Relais vers les données ouvertes d'Élections Québec : le navigateur ne peut pas lire leurs fichiers
 * directement (pas d'en-tête CORS). Le serveur les récupère, les garde en cache quelques secondes
 * (Élections Québec les actualise toutes les 2 à 5 minutes) et les sert aux comptes autorisés.
 *
 *   ?type=resultats     résultats de la soirée (resultats.json), cache 45 s
 *   ?type=candidatures  liste officielle des candidatures, cache 1 h
 *   ?type=demo&p=40     (admin) élections 2022 rejouées à 40 % des bureaux, pour tester l'affichage
 *   ?type=participation taux de participation préliminaire de la journée du vote (CSV par circonscription
 *                       + taux de l'ensemble du Québec lu dans la page d'Élections Québec), cache 2 min
 *
 * Seules ces adresses fixes sont lues : aucune adresse fournie par le visiteur n'est appelée.
 */
define('_FVEILLEUX', 1);
require_once __DIR__ . '/session.php';
// pas de base de données ici : réponse d'erreur JSON locale (même forme que db.php)
function errOut(string $msg, int $status = 400): never {
  http_response_code($status); header('Content-Type: application/json; charset=utf-8');
  echo json_encode(['error' => $msg], JSON_UNESCAPED_UNICODE); exit;
}

$s = getSession();
if (!$s) errOut('Non authentifié', 401);
$role  = $s['role'] ?? '';
$perms = normaliserPermissions($s['permissions'] ?? []);
if ($role !== 'admin' && !in_array('votes-quebec', $perms, true)) errOut('Accès refusé', 403);

const BASE = 'https://donnees.electionsquebec.qc.ca/production/provincial/';
const SOURCES = [
  'resultats'    => [BASE . 'resultats/resultats.json', 45],
  'candidatures' => [BASE . 'candidatures/candidatures.json', 3600],
  'demo'         => [BASE . 'resultats/archives/gen2022-10-03/resultats.json', 86400],
  'participation'=> ['https://donnees.electionsquebec.qc.ca/autres/provincial/taux_participation_preliminaire.csv', 120],
];
const PAGE_PARTICIPATION = 'https://www.electionsquebec.qc.ca/resultats-et-statistiques/taux-de-participation-preliminaire/';
$type = $_GET['type'] ?? 'resultats';
if (!isset(SOURCES[$type])) errOut('Type inconnu', 400);
if ($type === 'demo' && $role !== 'admin') errOut('Accès refusé', 403);
[$url, $ttl] = SOURCES[$type];

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

/* Cache partagé par tous les visiteurs, dans le dossier temporaire du serveur */
$cache = sys_get_temp_dir() . '/fv_live_' . $type . '.json';
$age   = is_file($cache) ? time() - filemtime($cache) : PHP_INT_MAX;

// [code HTTP, corps, date Last-Modified (horodatage ou null)]
function telecharger(string $url): array {
  if (function_exists('curl_init')) {                        // cURL d'abord (allow_url_fopen peut être désactivé)
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8, CURLOPT_FOLLOWLOCATION => false, CURLOPT_FILETIME => true,
      CURLOPT_USERAGENT => 'fveilleux.com (resultats en direct)', CURLOPT_HTTPHEADER => ['Accept: application/json, text/csv, text/html']]);
    $corps = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $t = (int)curl_getinfo($ch, CURLINFO_FILETIME); curl_close($ch);
    return [$code, $corps === false ? '' : (string)$corps, $t > 0 ? $t : null];
  }
  $ctx = stream_context_create(['http' => [
    'timeout' => 8, 'ignore_errors' => true,
    'header'  => "User-Agent: fveilleux.com (resultats en direct)\r\nAccept: application/json\r\n",
  ]]);
  $corps = @file_get_contents($url, false, $ctx);
  $code  = 0; $t = null;
  foreach ($http_response_header ?? [] as $h) {
    if (preg_match('#^HTTP/\S+\s+(\d{3})#', $h, $m)) $code = (int)$m[1];
    elseif (stripos($h, 'Last-Modified:') === 0) $t = strtotime(trim(substr($h, 14))) ?: null;
  }
  return [$code, $corps === false ? '' : $corps, $t];
}

/* Participation : CSV « CODE;NOM;TAUX » (UTF-8 avec BOM, virgule ou point décimal) → tableau JSON */
function lireParticipation(string $csv, ?int $maj): ?array {
  $csv = preg_replace('/^\xEF\xBB\xBF/', '', $csv);
  $lignes = preg_split('/\r\n|\n|\r/', trim($csv));
  if (count($lignes) < 2) return ['disponible' => false];
  $circ = [];
  foreach (array_slice($lignes, 1) as $l) {
    $c = str_getcsv($l, ';', '"', '');
    if (count($c) < 3 || trim($c[2]) === '') continue;
    $circ[] = ['code' => (int)$c[0], 'nom' => trim($c[1]), 'taux' => (float)str_replace(',', '.', $c[2])];
  }
  if (!$circ) return ['disponible' => false];
  $d = ['disponible' => true, 'circonscriptions' => $circ, 'maj' => $maj ? date('c', $maj) : null, 'ensemble' => null];
  // taux de l'ensemble du Québec : seulement dans la page web (pondéré par les électeurs inscrits, absent du CSV)
  [$code, $html] = telecharger(PAGE_PARTICIPATION);
  if ($code === 200 && preg_match('#id="tauxEnsemble"[^>]*>\s*([\d\s,.]+)\s*(?:&nbsp;|\xC2\xA0|\s)*%#u', $html, $m))
    $d['ensemble'] = (float)str_replace([',', ' ', "\u{A0}"], ['.', '', ''], $m[1]);
  return $d;
}

if ($age > $ttl) {
  $verrou = fopen($cache . '.lock', 'c');
  if ($verrou && flock($verrou, LOCK_EX | LOCK_NB)) {          // un seul téléchargement à la fois
    [$code, $corps, $maj] = telecharger($url);
    $json = $code !== 200 ? null : ($type === 'participation' ? lireParticipation($corps, $maj) : json_decode($corps, true));
    if (is_array($json)) {
      file_put_contents($cache, json_encode($json, JSON_UNESCAPED_UNICODE), LOCK_EX);
      $age = 0;
    } elseif ($code === 403 || $code === 404) {
      // fichier pas encore publié (avant 20 h le soir du vote) : on le note, sans effacer d'anciennes données
      if (!is_file($cache)) { file_put_contents($cache, json_encode(['disponible' => false]), LOCK_EX); $age = 0; }
      else touch($cache);
    }
    flock($verrou, LOCK_UN);
  }
  if ($verrou) fclose($verrou);
}

if (!is_file($cache)) { http_response_code(503); exit(json_encode(['disponible' => false, 'erreur' => 'Élections Québec ne répond pas pour le moment.'])); }
$donnees = json_decode((string)file_get_contents($cache), true) ?: ['disponible' => false];

/* Démo : 2022 rejouée en cours de dépouillement (pourcentage de bureaux p, différent d'une circonscription à l'autre) */
if ($type === 'demo' && isset($donnees['circonscriptions'])) {
  $p = max(0, min(100, (int)($_GET['p'] ?? 40))) / 100;
  foreach ($donnees['circonscriptions'] as &$c) {
    $f = $p >= 1 ? 1 : max(0, min(1, $p * (0.4 + 1.2 * (crc32($c['nomCirconscription']) % 1000) / 1000)));
    $c['nbBureauComplete'] = (int)round($c['nbBureauTotal'] * $f);
    $c['isResultatsFinaux'] = $f >= 1;
    foreach (['nbVoteValide', 'nbVoteRejete', 'nbVoteExerce'] as $k) $c[$k] = (int)round($c[$k] * $f);
    $c['tauxParticipation'] = number_format($c['nbElecteurInscrit'] ? 100 * $c['nbVoteExerce'] / $c['nbElecteurInscrit'] : 0, 2, '.', '');
    foreach ($c['candidats'] as &$k) {
      $k['nbVoteTotal'] = (int)round($k['nbVoteTotal'] * $f * (0.9 + 0.2 * (crc32($k['nom']) % 100) / 100));
      $k['nbVoteAvance'] = (int)round($k['nbVoteAvance'] * min(1, $f * 2));
    }
    unset($k);
    $tot = array_sum(array_column($c['candidats'], 'nbVoteTotal')) ?: 1;
    foreach ($c['candidats'] as &$k) $k['tauxVote'] = round(100 * $k['nbVoteTotal'] / $tot, 2);
    unset($k);
    usort($c['candidats'], fn($a, $b) => $b['nbVoteTotal'] <=> $a['nbVoteTotal']);
  }
  unset($c);
  $tot = array_sum(array_column($donnees['circonscriptions'], 'nbBureauComplete'));
  $donnees['statistiques']['nbBureauVoteRempli'] = $tot;
  $donnees['statistiques']['tauxBureauVoteRempli'] = round(100 * $tot / max(1, $donnees['statistiques']['nbBureauVote']), 1);
  $donnees['statistiques']['isResultatsFinaux'] = $p >= 1;
  $donnees['statistiques']['iso8601DateMAJ'] = date('c');
  $donnees['demo'] = true;
}

/* Candidatures : seulement les champs affichés (le fichier complet fait 700 Ko et contient les agents officiels) */
if ($type === 'candidatures' && array_is_list($donnees)) {
  $garder = ['code_circonscription', 'nom_circonscription', 'numero', 'nom_bulletin_vote', 'prenom_bulletin_vote',
             'abreviation_parti', 'nom_parti', 'depute_sortant', 'mention_independant_bull_vote'];
  $donnees = ['liste' => array_map(fn($c) => array_intersect_key($c, array_flip($garder)), $donnees)];
}
$donnees['ageCache'] = $age === PHP_INT_MAX ? null : $age;
echo json_encode($donnees, JSON_UNESCAPED_UNICODE);
