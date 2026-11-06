<?php
/*
 * Documentation AEC Avionique : sert le contenu des cours (leçons Markdown, images, PDF, vidéos MP4)
 * aux utilisateurs connectés qui ont la permission « aec-avionique » (jamais au compte invité).
 * Le contenu n'est PAS dans le dépôt (dépôt public, contenu des enseignants) : il est sur le serveur,
 * dans un dossier « cours-avionique » placé hors de public_html (même niveau que « manuels » et « config »).
 *
 *   GET cours.php?f=index.json                          → la structure complète (étapes, cours, modules, leçons)
 *   GET cours.php?f=etape1/cours1/m1/01-lecon.md        → une leçon
 *   GET cours.php?f=etape1/cours1/m1/fichiers/fig1.png  → une image, un PDF, une vidéo (lecture partielle « Range » pour les vidéos)
 *   Word, PowerPoint, Excel, Multisim (.ms13/.ms14) et .zip : envoyés en téléchargement (Content-Disposition: attachment)
 */
define('_FVEILLEUX', 1);
require_once __DIR__ . '/session.php';

const PERMISSIONS = ['aec-avionique'];
const TYPES = [
  'json' => 'application/json; charset=utf-8', 'md' => 'text/markdown; charset=utf-8', 'txt' => 'text/plain; charset=utf-8',
  'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'gif' => 'image/gif', 'webp' => 'image/webp', 'svg' => 'image/svg+xml',
  'pdf' => 'application/pdf', 'mp4' => 'video/mp4', 'webm' => 'video/webm', 'mp3' => 'audio/mpeg',
  // documents des cours, servis en téléchargement (Word, PowerPoint, Excel, Multisim, archives)
  'doc' => 'application/msword', 'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'ppt' => 'application/vnd.ms-powerpoint', 'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'xls' => 'application/vnd.ms-excel', 'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'ms13' => 'application/octet-stream', 'ms14' => 'application/octet-stream', 'zip' => 'application/zip',
];
const TELECHARGES = ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'ms13', 'ms14', 'zip'];

function refuse(int $code, string $msg): never {
  http_response_code($code);
  header('Content-Type: text/plain; charset=utf-8');
  header('Cache-Control: no-store');
  echo $msg;
  exit;
}

// Dossier « cours-avionique » : on remonte depuis le parent de la racine web, jamais à l'intérieur de celle-ci
function coursRoot(): ?string {
  $docRoot = realpath($_SERVER['DOCUMENT_ROOT'] ?? '') ?: realpath(dirname(__DIR__));
  $dir = dirname($docRoot);
  while (true) {
    $candidate = realpath($dir . '/cours-avionique');
    if ($candidate && is_dir($candidate) && !str_starts_with($candidate . '/', $docRoot . '/')) return $candidate;
    $parent = dirname($dir);
    if ($parent === $dir) return null;
    $dir = $parent;
  }
}

$s = getSession();
if (!$s) refuse(401, "Connexion requise.");
if (($s['role'] ?? '') === 'guest' || ($s['uid'] ?? '') === 'guest') refuse(403, "La documentation des cours n'est pas accessible au compte invité.");
$perms = is_array($s['permissions'] ?? null) ? $s['permissions'] : [];
if (($s['role'] ?? '') !== 'admin' && !array_intersect(PERMISSIONS, $perms)) refuse(403, "Accès refusé : permission « Documentation AEC Avionique » requise.");

$f = (string)($_GET['f'] ?? '');
// chemin relatif simple : pas de « .. », pas de chemin absolu, pas de fichier caché ; lettres accentuées permises
if ($f === '' || str_contains($f, '..') || str_starts_with($f, '/') || str_contains($f, '\\') || preg_match('#(^|/)\.#', $f)
    || !preg_match('#^[\p{L}\p{M}\p{N} _.,()\'&+-]+(/[\p{L}\p{M}\p{N} _.,()\'&+-]+)*$#u', $f)) refuse(400, "Nom de fichier invalide.");
$ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
if (!isset(TYPES[$ext])) refuse(400, "Type de fichier non servi.");

$root = coursRoot();
if (!$root) refuse(404, "Le contenu des cours n'est pas encore sur le serveur.");
$path = realpath("$root/$f");
// accents écrits autrement (fichiers venus d'un Mac : « é » en deux caractères) : on essaie l'autre forme
if ((!$path || !is_file($path)) && class_exists('Normalizer')) {
  foreach ([Normalizer::FORM_C, Normalizer::FORM_D] as $forme) {
    $g = Normalizer::normalize($f, $forme);
    if ($g && $g !== $f && ($q = realpath("$root/$g")) && is_file($q)) { $path = $q; break; }
  }
}
if (!$path || !is_file($path) || !str_starts_with($path, $root . '/')) refuse(404, "Fichier introuvable.");

session_write_close();   // ne pas bloquer les autres requêtes pendant l'envoi (vidéos)

$taille = filesize($path);
header('Content-Type: ' . TYPES[$ext]);
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: private, max-age=' . ($ext === 'json' || $ext === 'md' ? 300 : 86400));
if ($ext === 'svg') header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox");
if ($ext === 'pdf') header("Content-Disposition: inline; filename*=UTF-8''" . rawurlencode(basename($path)));
if (in_array($ext, TELECHARGES, true)) header("Content-Disposition: attachment; filename*=UTF-8''" . rawurlencode(basename($path)));
header('Accept-Ranges: bytes');

// lecture partielle (Range) : le lecteur vidéo avance sans tout télécharger
$debut = 0; $fin = $taille - 1;
if (isset($_SERVER['HTTP_RANGE']) && preg_match('/^bytes=(\d*)-(\d*)$/', trim($_SERVER['HTTP_RANGE']), $m) && ($m[1] !== '' || $m[2] !== '')) {
  if ($m[1] === '') { $debut = max(0, $taille - (int)$m[2]); }
  else { $debut = (int)$m[1]; if ($m[2] !== '') $fin = min((int)$m[2], $taille - 1); }
  if ($debut > $fin || $debut >= $taille) { header("Content-Range: bytes */$taille"); http_response_code(416); exit; }
  http_response_code(206);
  header("Content-Range: bytes $debut-$fin/$taille");
}
header('Content-Length: ' . ($fin - $debut + 1));
if ($_SERVER['REQUEST_METHOD'] === 'HEAD') exit;

$h = fopen($path, 'rb');
fseek($h, $debut);
$reste = $fin - $debut + 1;
while ($reste > 0 && !feof($h) && !connection_aborted()) {
  $bloc = fread($h, min(262144, $reste));
  if ($bloc === false) break;
  echo $bloc; flush();
  $reste -= strlen($bloc);
}
fclose($h);
