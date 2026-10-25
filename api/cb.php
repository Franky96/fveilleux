<?php
/*
 * Élection générale en Colombie-Britannique du 24 octobre 2026 (page « En direct ») : relais des résultats préliminaires d'Elections BC.
 *
 * Elections BC publie les résultats du soir du vote sur results.elections.bc.ca (site statique sur Azure, sans en-tête CORS : le
 * navigateur ne peut pas le lire directement). Le serveur lit la page d'accueil des résultats, puis les rapports qu'elle relie
 * (pages HTML ou fichiers JSON de résultats par candidat), les garde en cache 45 s et les rend tels quels dans « pages ».
 * L'interprétation se fait dans en-direct/direct.js (qui reconnaît les candidats de la liste officielle), qui lit aussi la copie
 * du pipeline (en-direct/resultats.json, même forme, écrite par en-direct/outils/cb.py) si ce relais ne répond pas.
 *
 *   ?type=resultats   cache 45 s
 *
 * Seuls les hôtes d'Elections BC sont lus (liens suivis seulement vers eux) : aucune adresse fournie par le visiteur n'est appelée.
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

const DEPART = 'https://results.elections.bc.ca/';
const TTL = 45;
const MAX_PAGES = 6;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$cache = sys_get_temp_dir() . '/fv_cb_resultats_v1.json';
$age   = is_file($cache) ? time() - filemtime($cache) : PHP_INT_MAX;

// hôtes d'Elections BC seulement
function permis(string $url): bool {
  $h = strtolower((string)parse_url($url, PHP_URL_HOST));
  return parse_url($url, PHP_URL_SCHEME) === 'https' && ($h === 'results.elections.bc.ca' || $h === 'electionsbcenr.blob.core.windows.net');
}
function lireUrl(string $url): array {
  $c = curl_init($url);
  curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_USERAGENT => 'fveilleux.com (resultats en direct)', CURLOPT_HTTPHEADER => ['Accept: text/html,application/json']]);
  $corps = (string)curl_exec($c); $code = (int)curl_getinfo($c, CURLINFO_RESPONSE_CODE);
  $vers = (string)curl_getinfo($c, CURLINFO_REDIRECT_URL); $type = (string)curl_getinfo($c, CURLINFO_CONTENT_TYPE); curl_close($c);
  return [$code, $corps, $vers, $type];
}
// suit au plus 3 renvois, seulement vers les hôtes permis
function lire(string $url): ?array {
  for ($i = 0; $i < 4; $i++) {
    [$code, $corps, $vers, $type] = lireUrl($url);
    if ($code >= 300 && $code < 400 && $vers) { if (!permis($vers)) return null; $url = $vers; continue; }
    return $code === 200 ? ['url' => $url, 'type' => str_contains($type, 'json') ? 'json' : 'html', 'corps' => $corps] : null;
  }
  return null;
}

if ($age > TTL) {
  $verrou = fopen($cache . '.lock', 'c');
  if ($verrou && flock($verrou, LOCK_EX | LOCK_NB)) {          // un seul téléchargement à la fois
    $pages = [];
    $accueil = lire(DEPART);
    if ($accueil) {
      $pages[] = $accueil;
      // rapports reliés par la page d'accueil (résultats par candidat d'abord)
      preg_match_all('/(?:href|src)\s*=\s*["\']([^"\'#]+\.(?:html?|json)(?:\?[^"\']*)?)["\']/i', $accueil['corps'], $m);
      $liens = [];
      foreach (array_unique($m[1]) as $l) {
        $abs = preg_match('~^https?://~i', $l) ? $l : rtrim(dirname($accueil['url'] . 'x'), '/') . '/' . ltrim($l, '/');
        if (permis($abs) && $abs !== $accueil['url']) $liens[] = $abs;
      }
      usort($liens, fn($a, $b) => (int)!preg_match('/candidat/i', $a) <=> (int)!preg_match('/candidat/i', $b));
      foreach (array_slice($liens, 0, MAX_PAGES - 1) as $l) { $p = lire($l); if ($p) $pages[] = $p; }
    }
    $d = ['disponible' => count($pages) > 0, 'maj' => date('c'), 'source' => DEPART, 'pages' => $pages];
    if ($pages || !is_file($cache)) file_put_contents($cache, json_encode($d, JSON_UNESCAPED_UNICODE), LOCK_EX);
    $age = 0;
    flock($verrou, LOCK_UN);
  }
  if ($verrou) fclose($verrou);
}

if (!is_file($cache)) { http_response_code(503); exit(json_encode(['disponible' => false, 'erreur' => 'Elections BC ne répond pas pour le moment.'], JSON_UNESCAPED_UNICODE)); }
$donnees = json_decode((string)file_get_contents($cache), true) ?: ['disponible' => false];
$donnees['ageCache'] = $age === PHP_INT_MAX ? null : $age;
echo json_encode($donnees, JSON_UNESCAPED_UNICODE);
