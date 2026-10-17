<?php
/*
 * Référendum en Alberta du 19 octobre 2026 (page « En direct ») : relais des résultats d'Élections Alberta.
 *
 * Le navigateur ne peut pas lire officialresults.elections.ab.ca directement (pas d'en-tête CORS). Le serveur lit les
 * pages de résultats des 10 questions (orEDResultsReferendum2026.cfm?EventId=202601 à 202610, une page par question,
 * nom tiré du site d'Élections Alberta), les garde en cache 45 s et en rend le contenu brut : texte et tableaux, cellule
 * par cellule. L'interprétation (questions, réponses, circonscriptions) se fait dans en-direct/direct.js, qui lit aussi
 * la copie du pipeline (en-direct/resultats.json, même forme, écrite par en-direct/outils/alberta.py) si ce relais ne
 * répond pas. Tant qu'un événement n'est pas ouvert, le site d'Élections Alberta redirige (302) : « pas encore publié ».
 *
 *   ?type=resultats   les 10 pages, cache 45 s
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

const BASE = 'https://officialresults.elections.ab.ca/';
const TTL = 45;
const EVENEMENTS = [202601, 202602, 202603, 202604, 202605, 202606, 202607, 202608, 202609, 202610];

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$cache = sys_get_temp_dir() . '/fv_alberta_resultats.json';
$age   = is_file($cache) ? time() - filemtime($cache) : PHP_INT_MAX;

/* contenu brut d'une page : texte (sans les tableaux) et tableaux, cellules en texte (colspan répété) */
function extraire(string $html): array {
  $doc = new DOMDocument();
  libxml_use_internal_errors(true);
  $html = preg_replace('/<br\s*\/?>/i', ' ', $html);          // « Voting<br>Locations » → « Voting Locations »
  $doc->loadHTML('<?xml encoding="UTF-8">' . $html, LIBXML_NONET | LIBXML_NOWARNING | LIBXML_NOERROR);
  libxml_clear_errors();
  $xp = new DOMXPath($doc);
  $net = fn(string $t) => trim(preg_replace('/\s+/u', ' ', str_replace("\u{A0}", ' ', $t)));
  $tables = [];
  foreach ($xp->query('//table') as $t) {
    if (count($tables) >= 30) break;
    $lignes = [];
    foreach ($xp->query('.//tr', $t) as $tr) {
      if (count($lignes) >= 400) break;
      // lignes du tableau lui-même seulement (pas celles d'un tableau imbriqué)
      $p = $tr->parentNode; while ($p && $p->nodeName !== 'table') $p = $p->parentNode;
      if ($p !== $t) continue;
      $cel = [];
      foreach ($tr->childNodes as $c) {
        if (!in_array(strtolower($c->nodeName), ['td', 'th'], true)) continue;
        $txt = mb_substr($net($c->textContent), 0, 300);
        $n = max(1, min(12, (int)($c->attributes?->getNamedItem('colspan')?->nodeValue ?? 1)));
        for ($k = 0; $k < $n; $k++) $cel[] = $txt;
      }
      if ($cel) $lignes[] = $cel;
    }
    if (count($lignes) >= 2) $tables[] = $lignes;
  }
  foreach ($xp->query('//script|//style|//table|//select|//nav') as $n) $n->parentNode?->removeChild($n);
  $titre = $net($xp->query('//title')->item(0)?->textContent ?? '');
  $texte = mb_substr($net($xp->query('//body')->item(0)?->textContent ?? ''), 0, 8000);
  return ['titre' => $titre, 'texte' => $texte, 'tables' => $tables];
}

if ($age > TTL) {
  $verrou = fopen($cache . '.lock', 'c');
  if ($verrou && flock($verrou, LOCK_EX | LOCK_NB)) {          // un seul téléchargement à la fois
    if (function_exists('curl_multi_init')) {
      $mh = curl_multi_init(); $ch = [];
      foreach (EVENEMENTS as $id) {
        $c = curl_init(BASE . 'orEDResultsReferendum2026.cfm?EventId=' . $id);
        curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 12, CURLOPT_FOLLOWLOCATION => false,
          CURLOPT_USERAGENT => 'fveilleux.com (resultats en direct)', CURLOPT_HTTPHEADER => ['Accept: text/html']]);
        curl_multi_add_handle($mh, $c); $ch[$id] = $c;
      }
      do { $st = curl_multi_exec($mh, $actifs); if ($actifs) curl_multi_select($mh, 1.0); } while ($actifs && $st === CURLM_OK);
      $pages = []; $ok = 0;
      foreach ($ch as $id => $c) {
        $code = (int)curl_getinfo($c, CURLINFO_RESPONSE_CODE); $corps = (string)curl_multi_getcontent($c);
        curl_multi_remove_handle($mh, $c); curl_close($c);
        if ($code === 200 && $corps !== '') { $pages[$id] = ['statut' => 200] + extraire($corps); $ok++; }
        else $pages[$id] = ['statut' => $code];             // 302 : événement pas encore ouvert ; 0 : pas de réponse
      }
      curl_multi_close($mh);
      $repondu = array_filter($pages, fn($p) => $p['statut'] > 0);
      if ($repondu) {                                         // Élections Alberta a répondu (même « pas encore publié »)
        $d = ['disponible' => $ok > 0, 'maj' => date('c'), 'source' => BASE, 'pages' => $pages];
        file_put_contents($cache, json_encode($d, JSON_UNESCAPED_UNICODE), LOCK_EX);
        $age = 0;
      }
    }
    flock($verrou, LOCK_UN);
  }
  if ($verrou) fclose($verrou);
}

if (!is_file($cache)) { http_response_code(503); exit(json_encode(['disponible' => false, 'erreur' => 'Élections Alberta ne répond pas pour le moment.'], JSON_UNESCAPED_UNICODE)); }
$donnees = json_decode((string)file_get_contents($cache), true) ?: ['disponible' => false];
$donnees['ageCache'] = $age === PHP_INT_MAX ? null : $age;
echo json_encode($donnees, JSON_UNESCAPED_UNICODE);
