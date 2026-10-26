<?php
/*
 * Élections locales à Taïwan du 28 novembre 2026 (page « En direct », en-direct-taiwan.html) : relais des résultats du dépouillement
 * publiés par la Commission électorale centrale (中央選舉委員會, CEC) pour les 22 maires et chefs de comté.
 *
 * La CEC publie le soir du vote un site de pages HTML statiques, sans en-tête CORS (le navigateur ne peut pas le lire directement) :
 * https://<hôte>/zh-TW/<type>/<code de 17 chiffres>.html. En 2022 : hôte www.cec.gov.tw, type « TC » pour les 22 courses de maire et de
 * chef de comté, code = code du comté sur 5 chiffres + 12 zéros (63000000000000000 = Taipei, 10002000000000000 = comté de Yilan,
 * 09020000000000000 = Kinmen ; 00000000000000000 = tout Taïwan). En 2024 : vote2024.cec.gov.tw (types P1, L1…) ; référendum de 2025 :
 * vote.cec.gov.tw (type F1). L'adresse de 2026 n'est pas encore annoncée (26 octobre 2026) : le relais essaie les hôtes et les types
 * connus (HOTES × TYPES, page de tout Taïwan), retient la première combinaison qui répond pendant 10 minutes, puis lit en parallèle
 * la page de chacune des 22 courses (municipalités spéciales en T1 et comtés en C1 si la CEC sépare les deux types).
 * Les pages, allégées (sans en-tête, scripts ni styles), sont gardées en cache 45 s et rendues dans « pages » ; l'interprétation se fait
 * dans en-direct/taiwan/direct.js, qui lit aussi la copie du pipeline (en-direct/taiwan/resultats.json, même forme, écrite par
 * en-direct/taiwan/outils/tw.py) si ce relais ne répond pas.
 *
 *   ?type=resultats   cache 45 s
 *
 * Seuls les hôtes de la CEC sont lus : aucune adresse fournie par le visiteur n'est appelée. Le réseau de diffusion de la CEC (HiNet) a
 * refusé les connexions venant de l'étranger entre deux scrutins (403, octobre 2026) : à vérifier le soir du vote.
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

const HOTES = ['vote.cec.gov.tw', 'vote2026.cec.gov.tw', 'www.cec.gov.tw'];
const TYPES = ['TC', 'C1', 'T1'];
const MUN = ['63000', '64000', '65000', '66000', '67000', '68000'];
const COMTES = ['10002', '10004', '10005', '10007', '10008', '10009', '10010', '10013', '10014', '10015', '10016', '10017', '10018', '10020', '09007', '09020'];
const TTL = 45;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$cache = sys_get_temp_dir() . '/fv_tw_resultats_v1.json';
$base  = sys_get_temp_dir() . '/fv_tw_base_v1.json';
$age   = is_file($cache) ? time() - filemtime($cache) : PHP_INT_MAX;

function poignee(string $url) {
  $c = curl_init($url);
  curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_CONNECTTIMEOUT => 6, CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_ENCODING => '', CURLOPT_USERAGENT => 'fveilleux.com (resultats en direct)', CURLOPT_HTTPHEADER => ['Accept: text/html']]);
  return $c;
}
// page allégée : le corps seulement, sans scripts, styles, commentaires ni espaces superflus
function alleger(string $h): string {
  if (preg_match('~<body[^>]*>(.*)</body>~is', $h, $m)) $h = $m[1];
  $h = preg_replace(['~<script\b.*?</script>~is', '~<style\b.*?</style>~is', '~<!--.*?-->~s', '~<nav\b.*?</nav>~is'], '', $h);
  return trim(preg_replace('/\s+/', ' ', $h));
}
// lit plusieurs pages en parallèle ; garde seulement les réponses 200 qui ressemblent à une page de résultats
function lirePlusieurs(array $urls): array {
  $m = curl_multi_init(); $h = [];
  foreach ($urls as $k => $u) { $h[$k] = poignee($u); curl_multi_add_handle($m, $h[$k]); }
  do { $st = curl_multi_exec($m, $actifs); if ($actifs) curl_multi_select($m, 1.0); } while ($actifs && $st === CURLM_OK);
  $out = [];
  foreach ($h as $k => $c) {
    $corps = (string)curl_multi_getcontent($c);
    if ((int)curl_getinfo($c, CURLINFO_RESPONSE_CODE) === 200 && preg_match('/<table|投票所/u', $corps)) $out[$k] = alleger($corps);
    curl_multi_remove_handle($m, $c); curl_close($c);
  }
  curl_multi_close($m);
  return $out;
}
$url = fn(string $hote, string $type, string $code) => "https://$hote/zh-TW/$type/" . str_pad($code, 17, '0') . '.html';

if ($age > TTL) {
  $verrou = fopen($cache . '.lock', 'c');
  if ($verrou && flock($verrou, LOCK_EX | LOCK_NB)) {          // un seul téléchargement à la fois
    // 1. hôte et type(s) : retenus 10 minutes, sinon essai de toutes les combinaisons connues (page de tout Taïwan)
    $b = is_file($base) && time() - filemtime($base) < 600 ? json_decode((string)file_get_contents($base), true) : null;
    $nat = [];
    if (!$b) {
      $essais = [];
      foreach (HOTES as $ho) foreach (TYPES as $ty) $essais["$ho|$ty"] = $url($ho, $ty, '0');
      $rep = lirePlusieurs($essais);
      foreach (HOTES as $ho) {
        $types = array_values(array_filter(TYPES, fn($ty) => isset($rep["$ho|$ty"])));
        if (!$types) continue;
        $types = in_array('TC', $types, true) ? ['TC'] : $types;
        $b = ['hote' => $ho, 'types' => $types];
        foreach ($types as $ty) $nat[$ty] = $rep["$ho|$ty"];
        file_put_contents($base, json_encode($b), LOCK_EX);
        break;
      }
    }
    // 2. les 22 courses en parallèle (plus la page de tout Taïwan si elle n'a pas déjà été lue)
    $pages = [];
    if ($b) {
      $ho = $b['hote']; $types = $b['types']; $urls = [];
      foreach ($types as $ty) if (!isset($nat[$ty])) $urls["$ty|00000"] = $url($ho, $ty, '0');
      foreach (array_merge(MUN, COMTES) as $code) {
        $ty = $types === ['TC'] ? 'TC' : (in_array($code, MUN, true) ? (in_array('T1', $types, true) ? 'T1' : $types[0]) : (in_array('C1', $types, true) ? 'C1' : $types[0]));
        $urls["$ty|$code"] = $url($ho, $ty, $code);
      }
      $lu = lirePlusieurs($urls);
      foreach ($nat as $ty => $corps) $lu["$ty|00000"] = $corps;
      foreach ($lu as $k => $corps) {
        [$ty, $code] = explode('|', $k);
        $pages[] = ['url' => $url($ho, $ty, $code), 'code' => $code, 'type' => 'html', 'corps' => $corps];
      }
      if (!$pages) @unlink($base);                                // l'hôte retenu ne répond plus : nouvel essai au prochain passage
    }
    $d = ['disponible' => count($pages) > 0, 'maj' => date('c'), 'source' => $b ? "https://{$b['hote']}/zh-TW/" . $b['types'][0] . '/' . str_repeat('0', 17) . '.html' : null, 'pages' => $pages];
    if ($pages || !is_file($cache)) { file_put_contents($cache, json_encode($d, JSON_UNESCAPED_UNICODE), LOCK_EX); $age = 0; }
    else $age = time() - filemtime($cache);                      // CEC muette : on garde la dernière lecture, avec son âge
    flock($verrou, LOCK_UN);
  }
  if ($verrou) fclose($verrou);
}

if (!is_file($cache)) { http_response_code(503); exit(json_encode(['disponible' => false, 'erreur' => 'La Commission électorale centrale ne répond pas pour le moment.'], JSON_UNESCAPED_UNICODE)); }
$donnees = json_decode((string)file_get_contents($cache), true) ?: ['disponible' => false];
$donnees['ageCache'] = $age === PHP_INT_MAX ? null : $age;
echo json_encode($donnees, JSON_UNESCAPED_UNICODE);
