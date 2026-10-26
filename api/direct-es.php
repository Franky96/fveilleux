<?php
/*
 * Élections générales en Espagne du 29 novembre 2026 (page « En direct », en-direct-espagne.html) : relais des résultats
 * provisoires du ministère de l'Intérieur (Congrès des députés).
 *
 * Le ministère publie le soir du vote un site de résultats (application d'Indra) qui lit des fichiers JSON publics. En 2023 :
 * site d'information elecciones.generales23j.es, résultats sur resultados.generales23j.es. Pour 2026, le site d'information est
 * 29neleccionesgenerales.es (annoncé par Interior le 20 octobre 2026) ; l'adresse des résultats n'est pas encore annoncée
 * (au 26 octobre, resultados.29neleccionesgenerales.es n'existe pas encore dans le DNS) : on suppose le même modèle, et on suit
 * aussi les liens « resultados » du site d'information. Seuls les hôtes en 29neleccionesgenerales.es sont lus.
 *
 * Le format des fichiers de 2023 n'a pas pu être retrouvé (site fermé). Le relais lit donc la page d'accueil des résultats,
 * repère les fichiers .json qu'elle ou ses scripts nomment (même hôte), et les rend tels quels dans « pages » ; direct.js les
 * interprète sans supposer de structure (noms de provinces, sigles des partis, voix). Si l'adresse des fichiers par province
 * est connue le soir du vote, la mettre dans PLANTILLES ({prov} = code INE à deux chiffres, 01 à 52) : les 52 fichiers sont lus
 * en parallèle.
 *
 *   ?type=resultats   cache 45 s (fichier temporaire unique, verrou : un seul téléchargement à la fois)
 *
 * Aucune adresse fournie par le visiteur n'est appelée. Copie de secours : en-direct/espagne/resultats.json (en-direct/espagne/outils/es.py).
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

const DEPARTS = ['https://resultados.29neleccionesgenerales.es/', 'https://29neleccionesgenerales.es/'];
const PLANTILLES = [];            // ex. 'https://resultados.29neleccionesgenerales.es/assets/data/congreso/{prov}.json' (à remplir le soir du vote)
const TTL = 45;
const MAX_PAGES = 12;
const MAX_SCRIPTS = 4;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$cache = sys_get_temp_dir() . '/fv_direct_es_resultats_v1.json';
$age   = is_file($cache) ? time() - filemtime($cache) : PHP_INT_MAX;

// hôtes du ministère pour cette élection seulement
function permis(string $url): bool {
  $h = strtolower((string)parse_url($url, PHP_URL_HOST));
  return parse_url($url, PHP_URL_SCHEME) === 'https' && ($h === '29neleccionesgenerales.es' || str_ends_with($h, '.29neleccionesgenerales.es'));
}
// le pare-feu du site (CloudFront) refuse les agents sans « Mozilla/5.0 (…) » (403, vérifié le 26 octobre 2026)
function poignee(string $url) {
  $c = curl_init($url);
  curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_FOLLOWLOCATION => false, CURLOPT_ENCODING => '',
    CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; fveilleux.com; resultados en directo)', CURLOPT_HTTPHEADER => ['Accept: application/json,text/html,*/*']]);
  return $c;
}
function reponse($c): array {
  $corps = (string)curl_multi_getcontent($c);
  return [(int)curl_getinfo($c, CURLINFO_RESPONSE_CODE), $corps, (string)curl_getinfo($c, CURLINFO_REDIRECT_URL), (string)curl_getinfo($c, CURLINFO_CONTENT_TYPE)];
}
// lit une adresse (au plus 3 renvois, seulement vers les hôtes permis)
function lire(string $url): ?array {
  for ($i = 0; $i < 4; $i++) {
    if (!permis($url)) return null;
    $c = poignee($url); $corps = (string)curl_exec($c);
    $code = (int)curl_getinfo($c, CURLINFO_RESPONSE_CODE); $vers = (string)curl_getinfo($c, CURLINFO_REDIRECT_URL); $type = (string)curl_getinfo($c, CURLINFO_CONTENT_TYPE);
    curl_close($c);
    if ($code >= 300 && $code < 400 && $vers) { $url = $vers; continue; }
    return $code === 200 ? ['url' => $url, 'type' => (str_contains($type, 'json') || preg_match('/^\s*[\[{]/', $corps)) ? 'json' : (str_contains($type, 'javascript') ? 'js' : 'html'), 'corps' => $corps] : null;
  }
  return null;
}
// plusieurs adresses en parallèle (fichiers par province) ; sans renvoi
function lirePlusieurs(array $urls): array {
  $m = curl_multi_init(); $h = [];
  foreach ($urls as $u) if (permis($u)) { $h[$u] = poignee($u); curl_multi_add_handle($m, $h[$u]); }
  do { $st = curl_multi_exec($m, $actif); if ($actif) curl_multi_select($m, 1.0); } while ($actif && $st === CURLM_OK);
  $out = [];
  foreach ($h as $u => $c) {
    [$code, $corps, , $type] = reponse($c);
    if ($code === 200 && $corps !== '') $out[] = ['url' => $u, 'type' => (str_contains($type, 'json') || preg_match('/^\s*[\[{]/', $corps)) ? 'json' : 'html', 'corps' => $corps];
    curl_multi_remove_handle($m, $c); curl_close($c);
  }
  curl_multi_close($m);
  return $out;
}
function absolue(string $l, string $base): string {
  if (preg_match('~^https?://~i', $l)) return $l;
  if (str_starts_with($l, '//')) return 'https:' . $l;
  $p = parse_url($base);
  $racine = $p['scheme'] . '://' . $p['host'];
  if (str_starts_with($l, '/')) return $racine . $l;
  return $racine . rtrim(preg_replace('~/[^/]*$~', '/', $p['path'] ?? '/'), '/') . '/' . ltrim(preg_replace('~^\./~', '', $l), '/');
}

if ($age > TTL) {
  $verrou = fopen($cache . '.lock', 'c');
  if ($verrou && flock($verrou, LOCK_EX | LOCK_NB)) {
    $pages = [];
    if (PLANTILLES) {
      $urls = [];
      foreach (PLANTILLES as $t) for ($p = 1; $p <= 52; $p++) $urls[] = str_replace('{prov}', str_pad((string)$p, 2, '0', STR_PAD_LEFT), $t);
      $pages = lirePlusieurs($urls);
    }
    if (!$pages) {
      foreach (DEPARTS as $depart) {
        $accueil = lire($depart); if (!$accueil) continue;
        // site d'information : suivre un lien vers la page des résultats (même domaine)
        if (!str_starts_with(parse_url($accueil['url'], PHP_URL_HOST), 'resultados') && preg_match_all('/href\s*=\s*["\']([^"\']*resultados[^"\']*)["\']/i', $accueil['corps'], $m)) {
          foreach (array_unique($m[1]) as $l) { $a = absolue($l, $accueil['url']); if (permis($a) && $a !== $accueil['url']) { $r = lire($a); if ($r) { $accueil = $r; break; } } }
        }
        // fichiers JSON nommés dans la page ou dans ses scripts (même hôte), relatifs au <base href> de l'application s'il y en a un
        $base = preg_match('/<base[^>]+href\s*=\s*["\']([^"\']+)["\']/i', $accueil['corps'], $bm) ? absolue($bm[1], $accueil['url']) : $accueil['url'];
        $textes = [$accueil['corps']];
        preg_match_all('/<script[^>]+src\s*=\s*["\']([^"\']+\.js[^"\']*)["\']/i', $accueil['corps'], $sc);
        foreach (array_slice(array_unique($sc[1]), 0, MAX_SCRIPTS) as $l) { $a = absolue($l, $base); if (permis($a)) { $r = lire($a); if ($r) $textes[] = $r['corps']; } }
        $json = [];
        foreach ($textes as $t) if (preg_match_all('~["\'(]((?:https://[a-z0-9.-]+)?/?[A-Za-z0-9_./-]+\.json(?:\?[^"\')\s]*)?)["\')]~', $t, $mm))
          foreach ($mm[1] as $l) { $a = absolue($l, $base); if (permis($a)) $json[$a] = true; }
        $json = array_keys($json);
        // congrès et totaux d'abord (noms de fichiers usuels), puis le reste
        usort($json, fn($a, $b) => (int)!preg_match('/congres|cong|_co|total|nacional|99/i', $a) <=> (int)!preg_match('/congres|cong|_co|total|nacional|99/i', $b));
        $pages = lirePlusieurs(array_slice($json, 0, MAX_PAGES));
        if (!$pages) $pages = [$accueil];                     // au moins la page : direct.js y cherche un tableau
        break;
      }
    }
    // disponible : au moins un fichier de données (la seule page d'accueil ne contient pas encore de résultats)
    $d = ['disponible' => (bool)array_filter($pages, fn($p) => $p['type'] === 'json'), 'maj' => date('c'), 'source' => DEPARTS[0], 'pages' => array_values($pages)];
    if ($pages || !is_file($cache)) file_put_contents($cache, json_encode($d, JSON_UNESCAPED_UNICODE), LOCK_EX);
    $age = 0;
    flock($verrou, LOCK_UN);
  }
  if ($verrou) fclose($verrou);
}

if (!is_file($cache)) { http_response_code(503); exit(json_encode(['disponible' => false, 'erreur' => 'Le site des résultats ne répond pas pour le moment.'], JSON_UNESCAPED_UNICODE)); }
$donnees = json_decode((string)file_get_contents($cache), true) ?: ['disponible' => false];
$donnees['ageCache'] = $age === PHP_INT_MAX ? null : $age;
echo json_encode($donnees, JSON_UNESCAPED_UNICODE);
