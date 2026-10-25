<?php
/*
 * Votes Québec : photo officielle d'un député de l'Assemblée nationale, relayée par le serveur.
 *
 * L'Assemblée nationale sert ses photos (assnat.qc.ca/Media/Process.aspx…) avec un type invalide (« Image/.jpg ») et
 * « X-Content-Type-Options: nosniff » : Chrome les bloque dans une page d'un autre site (ORB). Ce relais les renvoie avec le
 * bon type. Seules les photos de votes-quebec/deputes.json (liste officielle, outils/deputes.py) sont servies, désignées par
 * le nom de la circonscription : aucune adresse fournie par le visiteur n'est appelée. Cache d'une journée sur le serveur.
 *
 *   ?c=<nom de la circonscription>
 */
define('_FVEILLEUX', 1);
require_once __DIR__ . '/session.php';
if (!getSession()) { http_response_code(401); exit; }

$c = (string)($_GET['c'] ?? '');
$liste = json_decode((string)@file_get_contents(__DIR__ . '/../votes-quebec/deputes.json'), true);
$url = $liste['deputes'][$c]['photo'] ?? '';
if (!$url || !preg_match('~^https://www\.assnat\.qc\.ca/Media/Process\.aspx\?~', $url)) { http_response_code(404); exit; }

$cache = sys_get_temp_dir() . '/fv_photo_depute_' . sha1($url) . '.img';
if (!is_file($cache) || time() - filemtime($cache) > 86400) {
  $h = curl_init($url);
  curl_setopt_array($h, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_USERAGENT => 'fveilleux.com (photos des deputes)']);
  $img = (string)curl_exec($h); $code = (int)curl_getinfo($h, CURLINFO_RESPONSE_CODE); curl_close($h);
  $ok = substr($img, 0, 3) === "\xFF\xD8\xFF" || substr($img, 0, 4) === "\x89PNG";           // JPEG ou PNG seulement
  if ($code === 200 && strlen($img) > 500 && $ok) file_put_contents($cache, $img, LOCK_EX);
  elseif (!is_file($cache)) { http_response_code(502); exit; }
}
$debut = (string)file_get_contents($cache, false, null, 0, 4);
header('Content-Type: ' . ($debut === "\x89PNG" ? 'image/png' : 'image/jpeg'));
header('Cache-Control: private, max-age=86400');
readfile($cache);
