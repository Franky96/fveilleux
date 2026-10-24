<?php
/*
 * Référendum en Alberta du 19 octobre 2026 (page « En direct ») : relais des résultats non officiels d'Élections Alberta.
 *
 * Élections Alberta publie les résultats sur results.elections.ab.ca (tableau de bord « 2026 Referendum Unofficial
 * Results », données en JSON : /data/<code>?version=<v>&questions=…&wards=), sans en-tête CORS : le navigateur ne peut
 * pas les lire directement. Le serveur lit la page (code et version du tableau de bord), puis les données des 10 questions
 * avec le détail par circonscription (identifiants 1 à 9 et 11 pour la question 10), les garde en cache 45 s et les rend
 * telles quelles dans « eab ». L'interprétation se fait dans en-direct/direct.js, qui lit aussi la copie du pipeline
 * (en-direct/resultats.json, même forme, écrite par en-direct/outils/alberta.py) si ce relais ne répond pas.
 * (Les pages orEDResultsReferendum2026.cfm d'officialresults.elections.ab.ca prévues avant le vote n'ont pas servi.)
 *
 *   ?type=resultats   cache 45 s
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
if (($_GET['type'] ?? 'resultats') !== 'resultats') errOut('Type inconnu', 400);

const BASE = 'https://results.elections.ab.ca/';
const TTL = 45;
const QUESTIONS = '1,2,3,4,5,6,7,8,9,11';                     // 11 = question 10 (séparation) dans les données

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$cache = sys_get_temp_dir() . '/fv_alberta_resultats_v2.json';
$age   = is_file($cache) ? time() - filemtime($cache) : PHP_INT_MAX;

function lireUrl(string $url, string $accept): array {
  $c = curl_init($url);
  curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_USERAGENT => 'fveilleux.com (resultats en direct)', CURLOPT_HTTPHEADER => ['Accept: ' . $accept]]);
  $corps = (string)curl_exec($c); $code = (int)curl_getinfo($c, CURLINFO_RESPONSE_CODE);
  $vers = (string)curl_getinfo($c, CURLINFO_REDIRECT_URL); curl_close($c);
  return [$code, $corps, $vers];
}

if ($age > TTL) {
  $verrou = fopen($cache . '.lock', 'c');
  if ($verrou && flock($verrou, LOCK_EX | LOCK_NB)) {          // un seul téléchargement à la fois
    // code et version du tableau de bord (options de la page) ; depuis le 23 octobre 2026, la racine renvoie (302) vers
    // /8400 : on suit ce renvoi s'il reste sur results.elections.ab.ca (sans quoi la version manquait, l'ancienne 3.0.0
    // était demandée et Élections Alberta ne répondait que {"forceFullRefresh":true} : relais figé sur son dernier cache)
    [$code, $page, $vers] = lireUrl(BASE, 'text/html');
    if ($code >= 300 && $code < 400 && str_starts_with($vers, BASE) && preg_match('~^[\w/]*$~', substr($vers, strlen(BASE))))
      [$code, $page] = lireUrl($vers, 'text/html');
    $mun = preg_match("/countyMun:\s*'(\d+)'/", $page, $m) ? $m[1] : '8400';
    $ver = preg_match("/version:\s*'([\w.]+)'/", $page, $m) ? $m[1] : '3.3.3';
    [$code, $corps] = lireUrl(BASE . "data/$mun?version=" . rawurlencode($ver) . '&questions=' . QUESTIONS . '&wards=', 'application/json');
    $j = $code === 200 ? json_decode($corps, true) : null;
    if (is_array($j) && !empty($j['success']) && isset($j['referendumResults'])) {
      $r = $j['referendumResults'];
      $nb = (int)($r['widgets']['summary']['valid'] ?? 0);
      $d = ['disponible' => $nb > 0, 'maj' => $j['lastUpdated'] ?? date('c'), 'source' => BASE,
            'eab' => ['lastUpdated' => $j['lastUpdated'] ?? null, 'widgets' => $r['widgets'] ?? [], 'wards' => $r['wards'] ?? [],
                      'questionStats' => $r['votes']['questionStats'] ?? []]];
      file_put_contents($cache, json_encode($d, JSON_UNESCAPED_UNICODE), LOCK_EX);
      $age = 0;
    }
    flock($verrou, LOCK_UN);
  }
  if ($verrou) fclose($verrou);
}

if (!is_file($cache)) { http_response_code(503); exit(json_encode(['disponible' => false, 'erreur' => 'Élections Alberta ne répond pas pour le moment.'], JSON_UNESCAPED_UNICODE)); }
$donnees = json_decode((string)file_get_contents($cache), true) ?: ['disponible' => false];
$donnees['ageCache'] = $age === PHP_INT_MAX ? null : $age;
echo json_encode($donnees, JSON_UNESCAPED_UNICODE);
