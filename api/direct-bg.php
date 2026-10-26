<?php
/*
 * Présidentielle en Bulgarie, 2e tour du 1er novembre 2026 (page « En direct ») : relais des résultats de la Commission électorale
 * centrale (ЦИК / CIK), results.cik.bg (pas d'en-tête CORS : le navigateur ne peut pas le lire directement).
 *
 * Lit le résumé national (rezultati/index.html), les 32 circonscriptions (rezultati/01.html … 32.html, 32 = vote à l'étranger) et la
 * participation (aktivnost/index.html, aktivnost/01.html … 31.html, relue toutes les 5 minutes seulement), en tire le même JSON compact
 * que la copie du pipeline (en-direct/bulgarie/outils/bg.py, même logique d'interprétation : garder les deux pareilles) et le garde
 * en cache 45 s. Adresse du 2e tour : cherchée dans l'index de results.cik.bg (voir bg.py), gardée 10 minutes.
 *
 *   ?tour=2 (défaut) · ?tour=1        cache 45 s
 *
 * results.cik.bg est derrière Cloudflare, qui met au défi certaines lectures sans navigateur (libcurl oui, flux PHP non, le 26 octobre 2026 :
 * voir lirePlusieurs) ; si tout est refusé, le relais répond { disponible: false, raison: "cloudflare" } (ou garde les derniers chiffres,
 * « perime ») et la page lit la copie du pipeline (en-direct/bulgarie/resultats.json). Une lecture complète prend 15 à 35 s : un seul
 * téléchargement à la fois (verrou), les autres visiteurs reçoivent le cache. Seul l'hôte results.cik.bg est lu : aucune adresse fournie par le visiteur n'est appelée.
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
$tour = (int)($_GET['tour'] ?? 2);
if ($tour !== 1 && $tour !== 2) errOut('Tour inconnu', 400);

const RACINE = 'https://results.cik.bg/';
const TOUR1 = 'https://results.cik.bg/pvr202610/';
const ESSAIS2 = ['pvr202610/tur2/', 'pvr202611/', 'pvr202610_2/', 'pvr202610-2/', 'pvr2026_2/'];
const TTL = 45, TTL_ACT = 300, TTL_BASE = 600, NB_MIR = 32;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
@set_time_limit(150);

$cache = sys_get_temp_dir() . "/fv_direct_bg_t{$tour}_v1.json";
$age   = is_file($cache) ? time() - filemtime($cache) : PHP_INT_MAX;

function permis(string $url): bool {
  return parse_url($url, PHP_URL_SCHEME) === 'https' && strtolower((string)parse_url($url, PHP_URL_HOST)) === 'results.cik.bg';
}
// Cloudflare met au défi certaines empreintes TLS : celle de libcurl l'est (403, « Just a moment »), alors que les flux de PHP
// (file_get_contents, OpenSSL) passent (essai du 26 octobre 2026, comme urllib de Python). On essaie curl en parallèle, puis, au
// premier défi, les flux un par un ; le mode retenu est gardé une heure.
$defi = false;
$modeF = sys_get_temp_dir() . '/fv_direct_bg_mode_v1.txt';
function lireFlux(string $u): ?string {
  global $defi;
  $o = ['http' => ['header' => 'User-Agent: ' . UA . "\r\nAccept: text/html\r\nAccept-Language: bg,en;q=0.8\r\n", 'ignore_errors' => true, 'timeout' => 15, 'follow_location' => 0]];
  if ($p = getenv('HTTPS_PROXY')) {                                   // essais locaux derrière un mandataire
    $pp = parse_url($p); $o['http']['proxy'] = 'tcp://' . $pp['host'] . ':' . $pp['port'];
    if (is_file('/root/.ccr/ca-bundle.crt')) $o['ssl'] = ['cafile' => '/root/.ccr/ca-bundle.crt', 'peer_name' => 'results.cik.bg'];
  }
  $corps = @file_get_contents($u, false, stream_context_create($o));
  $code = isset($http_response_header[0]) && preg_match('#\s(\d{3})\s#', $http_response_header[0] . ' ', $m) ? (int)$m[1] : 0;
  if ($code === 403 && str_contains((string)$corps, 'Just a moment')) $defi = true;
  return $code === 200 ? (string)$corps : null;
}
function lirePlusieurs(array $urls): array {
  global $defi, $modeF;
  $urls = array_values(array_filter($urls, 'permis'));
  $flux = is_file($modeF) && time() - filemtime($modeF) < 3600 && trim((string)file_get_contents($modeF)) === 'flux';
  if (!$flux) {
    $out = lireCurl($urls);
    if (!$defi) return $out;
    $defi = false; file_put_contents($modeF, 'flux', LOCK_EX);
  }
  $out = [];
  foreach ($urls as $u) { $out[$u] = lireFlux($u); if ($defi) break; }
  return $out;
}
// lecture en parallèle (8 à la fois) ; renvoie [url => corps|null] et note un défi de Cloudflare
function lireCurl(array $urls): array {
  global $defi;
  $out = [];
  foreach (array_chunk($urls, 8) as $lot) {
    $mh = curl_multi_init(); $hs = [];
    foreach ($lot as $u) {
      $c = curl_init($u);
      curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20, CURLOPT_FOLLOWLOCATION => false, CURLOPT_ENCODING => '',
        CURLOPT_USERAGENT => UA, CURLOPT_HTTPHEADER => ['Accept: text/html', 'Accept-Language: bg,en;q=0.8']]);
      curl_multi_add_handle($mh, $c); $hs[$u] = $c;
    }
    do { $st = curl_multi_exec($mh, $actifs); if ($actifs) curl_multi_select($mh, 1.0); } while ($actifs && $st === CURLM_OK);
    foreach ($hs as $u => $c) {
      $code = (int)curl_getinfo($c, CURLINFO_RESPONSE_CODE); $corps = (string)curl_multi_getcontent($c);
      if ($code === 403 && str_contains($corps, 'Just a moment')) $defi = true;
      $out[$u] = $code === 200 ? $corps : null;
      curl_multi_remove_handle($mh, $c); curl_close($c);
    }
    curl_multi_close($mh);
    if ($defi) break;
  }
  return $out;
}

/* ---------- interprétation (même logique que bg.py) ---------- */
function nombre(?string $t): ?int {
  $t = preg_replace('/\s+|&nbsp;|\xc2\xa0/u', '', strip_tags((string)$t));
  return ctype_digit($t) ? (int)$t : null;
}
function texte(?string $t): string {
  $t = str_replace(['&nbsp;', '&quot;', '&amp;'], [' ', '"', '&'], strip_tags(preg_replace('/<[^>]+>/', ' ', (string)$t)));
  return trim(preg_replace('/\s+/u', ' ', $t));
}
function blocPresident(string $html): string {
  preg_match_all('/<li[^>]*data-elem="(\d+)"[^>]*>\s*<a href="#(t\d+)">([^<]*)<\/a>/u', $html, $m, PREG_SET_ORDER);
  if (!$m) return $html;
  $cle = $m[0][2];
  foreach ($m as $o) if (str_contains($o[3], 'Президент')) { $cle = $o[2]; break; }
  $i = strpos($html, 'id="' . $cle . '"'); if ($i === false) return $html;
  $fin = strpos($html, 'class="item', $i + 10);
  return substr($html, $i, $fin === false ? null : $fin - $i);
}
function heureDonnees(string $html): array {
  if (!preg_match('/Данни към (\d{1,2}):(\d{2}) на (\d{2})\.(\d{2})\.(\d{4})(?: г\.)? при обработени ([\d.,]+)\s*%/u', $html, $m)) return [null, null];
  $d = new DateTime(sprintf('%04d-%02d-%02d %02d:%02d:00', $m[5], $m[4], $m[3], $m[1], $m[2]), new DateTimeZone('Europe/Sofia'));
  return [$d->format('c'), (float)str_replace(',', '.', $m[6])];
}
function lireResultats(string $html): array {
  preg_match('/class="election-type">(.*?)<\/h4>/su', $html, $t);
  [$donnees, $pct] = heureDonnees($html);
  $b = blocPresident($html);
  $cands = []; $nsp = null;
  preg_match_all('/<tr class="([^"]*)">\s*<td[^>]*>\s*<strong>\s*(\d+|-)\s*<\/strong>\s*<\/td>\s*<td>\s*<strong>(.*?)<\/strong>\s*(?:<br\s*\/?>)?(.*?)<\/td>\s*<td class="text-right" data-sort="(\d+)"/su', $b, $m, PREG_SET_ORDER);
  foreach ($m as [, $cl, $n, $nom, $comite, $v]) {
    if ($n === '-') { $nsp = (int)$v; continue; }
    $cands[] = ['n' => (int)$n, 'nom' => texte($nom), 'comite' => texte($comite), 'v' => (int)$v, 'elu' => str_contains($cl, 'elected')];
  }
  $proto = [];
  preg_match_all('/<tr>\s*<td>\s*(\d\.[^<]*?)<\/td>\s*<td[^>]*>([\d\s&nbsp;\xc2\xa0]+)<\/td>/u', $b, $m, PREG_SET_ORDER);
  $cles = ['1' => 'liste', '2' => 'ajoutes', '3' => 'votants', '6' => 'nuls', '7' => 'valides'];
  foreach ($m as [, $lab, $val]) {
    $k = preg_match('/^\d\. /', $lab) ? ($cles[$lab[0]] ?? null) : null;
    if ($k && !array_key_exists($k, $proto)) $proto[$k] = nombre($val);
  }
  if (isset($proto['liste'])) $proto['inscrits'] = $proto['liste'] + ($proto['ajoutes'] ?? 0);
  $sic = preg_match('/В\. Брой на СИК, предали протокол\s*<\/td>\s*<td[^>]*>([^<]+)/u', $b, $ms) ? nombre($ms[1]) : null;
  $final = $donnees === null && $cands && $proto;
  return ['titre' => texte($t[1] ?? ''), 'donnees' => $donnees, 'pct' => $final ? 100.0 : $pct, 'final' => (bool)$final, 'cands' => $cands,
    'nsp' => $nsp, 'proto' => $proto ?: null, 'sic' => $sic];
}
function lireActivite(?string $html): array {
  $L = [];
  preg_match_all('/<td[^>]*>\s*(\d{1,2}:\d{2})\s*<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>\s*([\d.,]+)\s*%/u', (string)$html, $m, PREG_SET_ORDER);
  foreach ($m as [, $h, $ins, $vot, $p]) if (nombre($ins) && nombre($vot) !== null)
    $L[] = ['h' => $h, 'inscrits' => nombre($ins), 'votants' => nombre($vot), 'pct' => (float)str_replace(',', '.', $p)];
  return $L;
}
function estTour2(?string $html): bool {
  return (bool)(preg_match('/class="election-type">(.*?)<\/h4>/su', (string)$html, $t) && preg_match('/втори тур|1 ноември 2026|01\.11\.2026/u', texte($t[1])));
}
function trouverTour2(): ?string {
  global $defi;
  $f = sys_get_temp_dir() . '/fv_direct_bg_base_v1.txt';
  if (is_file($f) && time() - filemtime($f) < TTL_BASE && ($b = trim((string)file_get_contents($f)))) return $b;
  $idx = lirePlusieurs([RACINE])[RACINE] ?? '';
  if ($defi) return null;
  preg_match_all('#href="(?:https://results\.cik\.bg)?/?(pvr2026[^"\#?]*?/)rezultati/index\.html"#u', (string)$idx, $m);
  $bases = [];
  foreach ($m[1] as $c) { $b = RACINE . ltrim($c, '/'); if ($b !== TOUR1 && !in_array($b, $bases, true)) $bases[] = $b; }
  foreach (ESSAIS2 as $e) if (!in_array(RACINE . $e, $bases, true)) $bases[] = RACINE . $e;
  $bases[] = TOUR1;
  foreach ($bases as $b) {
    $p = lirePlusieurs([$b . 'rezultati/index.html'])[$b . 'rezultati/index.html'] ?? null;
    if ($defi) return null;
    if (estTour2($p)) { file_put_contents($f, $b, LOCK_EX); return $b; }
  }
  return null;
}

if ($age > TTL) {
  $verrou = fopen($cache . '.lock', 'c');
  if ($verrou && flock($verrou, LOCK_EX | LOCK_NB)) {          // un seul téléchargement à la fois
    $avant = is_file($cache) ? (json_decode((string)file_get_contents($cache), true) ?: []) : [];
    $base = $tour === 1 ? TOUR1 : trouverTour2();
    $d = null; $raison = $defi ? 'cloudflare' : ($base ? 'illisible' : 'introuvable');
    if ($base) {
      $actFraiche = isset($avant['actLu']) && time() - $avant['actLu'] < TTL_ACT && ($avant['source'] ?? '') === $base;
      $urls = [$base . 'rezultati/index.html'];
      for ($k = 1; $k <= NB_MIR; $k++) $urls[] = $base . sprintf('rezultati/%02d.html', $k);
      if (!$actFraiche) { $urls[] = $base . 'aktivnost/index.html'; for ($k = 1; $k < NB_MIR; $k++) $urls[] = $base . sprintf('aktivnost/%02d.html', $k); }
      $p = lirePlusieurs($urls);
      $nat = $p[$base . 'rezultati/index.html'] ?? null;
      $r = $nat ? lireResultats($nat) : null;
      if ($defi) $raison = 'cloudflare';
      $actN = $actFraiche ? ($avant['activite'] ?? []) : lireActivite($p[$base . 'aktivnost/index.html'] ?? null);
      if ($r && ($r['cands'] || $actN)) {                       // avant la fermeture : la participation seule
        $mir = [];
        for ($k = 1; $k <= NB_MIR; $k++) {
          $h = $p[$base . sprintf('rezultati/%02d.html', $k)] ?? null; if (!$h) continue;
          $x = lireResultats($h);
          $act = $actFraiche ? ($avant['mir'][(string)$k]['activite'] ?? []) : ($k < NB_MIR ? lireActivite($p[$base . sprintf('aktivnost/%02d.html', $k)] ?? null) : []);
          if (!$x['cands'] && !$act) continue;
          $fin = $x['donnees'] === null && ($r['final'] || ($r['pct'] ?? 0) >= 100);
          $v = []; foreach ($x['cands'] as $c) $v[(string)$c['n']] = $c['v'];
          $mir[(string)$k] = ['pct' => $fin ? 100.0 : $x['pct'], 'final' => $fin, 'v' => $v, 'nsp' => $x['nsp'], 'activite' => $act];
        }
        $d = ['disponible' => true, 'maj' => date('c'), 'source' => $base, 'tour' => $tour, 'titre' => $r['titre'], 'donnees' => $r['donnees'],
          'pct' => $r['pct'], 'final' => $r['final'], 'sic' => $r['sic'], 'cands' => $r['cands'], 'nsp' => $r['nsp'], 'proto' => $r['proto'],
          'activite' => $actN, 'mir' => (object)$mir,
          'actLu' => $actFraiche ? $avant['actLu'] : time(), 'via' => 'relais'];
      }
    }
    // échec : on garde les derniers résultats lus (marqués périmés), sinon on note la raison
    if (!$d) $d = !empty($avant['disponible']) ? array_merge($avant, ['perime' => true, 'raison' => $raison]) : ['disponible' => false, 'maj' => date('c'), 'raison' => $raison];
    file_put_contents($cache, json_encode($d, JSON_UNESCAPED_UNICODE), LOCK_EX);
    if (empty($d['perime'])) $age = 0; else $age = time() - strtotime((string)$d['maj']);
    flock($verrou, LOCK_UN);
  }
  if ($verrou) fclose($verrou);
}

if (!is_file($cache)) { http_response_code(503); exit(json_encode(['disponible' => false, 'raison' => 'attente'], JSON_UNESCAPED_UNICODE)); }
$donnees = json_decode((string)file_get_contents($cache), true) ?: ['disponible' => false];
unset($donnees['actLu']);
$donnees['ageCache'] = $age === PHP_INT_MAX ? null : $age;
echo json_encode($donnees, JSON_UNESCAPED_UNICODE);
