<?php
/*
 * Sert les manuels techniques (PDF) aux utilisateurs connectés uniquement.
 * Les fichiers sont stockés hors de public_html, dans un dossier « manuels »
 * placé à côté (ou au-dessus) du dossier web, et ne sont jamais versionnés.
 *
 *   GET manuel.php?m=PT6A-21&doc=AMM&f=72-30.pdf   → le PDF
 *   GET manuel.php?m=PT6A-21&doc=AMM&list=1        → liste JSON des PDF disponibles
 */
define('_FVEILLEUX', 1);
require_once __DIR__ . '/session.php';

const MANUELS = [
  'PT6A-21' => ['AMM', 'IPC', 'OM'],
];
const PERMISSIONS = ['moteurs', 'pt6a21'];

function refuse(int $code, string $msg): never {
  http_response_code($code);
  header('Content-Type: text/plain; charset=utf-8');
  header('Cache-Control: no-store');
  echo $msg;
  exit;
}

// Dossier « manuels » : on remonte depuis le parent de la racine web, jamais à l'intérieur de celle-ci
function manuelsRoot(): ?string {
  $docRoot = realpath($_SERVER['DOCUMENT_ROOT'] ?? '') ?: realpath(dirname(__DIR__));
  $dir = dirname($docRoot);
  while (true) {
    $candidate = realpath($dir . '/manuels');
    if ($candidate && is_dir($candidate) && !str_starts_with($candidate . '/', $docRoot . '/')) return $candidate;
    $parent = dirname($dir);
    if ($parent === $dir) return null;
    $dir = $parent;
  }
}

$s = getSession();
if (!$s) refuse(401, "Connexion requise pour consulter les manuels.");
$perms = is_array($s['permissions'] ?? null) ? $s['permissions'] : [];
if (($s['role'] ?? '') !== 'admin' && !array_intersect(PERMISSIONS, $perms)) {
  refuse(403, "Accès refusé : permission « Moteurs » requise.");
}

$m   = $_GET['m'] ?? '';
$doc = strtoupper($_GET['doc'] ?? '');
if (!isset(MANUELS[$m]) || !in_array($doc, MANUELS[$m], true)) refuse(400, "Manuel inconnu.");

$root = manuelsRoot();
if (!$root) refuse(500, "Dossier des manuels introuvable sur le serveur.");
$dir = realpath("$root/$m/$doc");
if (!$dir || !str_starts_with($dir . '/', $root . '/')) refuse(404, "Ce manuel n'est pas encore disponible.");

if (isset($_GET['list'])) {
  $files = array_values(array_filter(scandir($dir), fn($f) => preg_match('/^[A-Za-z0-9 _.-]+\.pdf$/i', $f)));
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: private, max-age=300');
  echo json_encode(['files' => $files], JSON_UNESCAPED_UNICODE);
  exit;
}

$f = $_GET['f'] ?? '';
if (!preg_match('/^[A-Za-z0-9 _.-]+\.pdf$/i', $f) || str_contains($f, '..')) refuse(400, "Nom de fichier invalide.");
$path = realpath("$dir/$f");
if (!$path || !is_file($path) || dirname($path) !== $dir) refuse(404, "Chapitre introuvable dans ce manuel.");

session_write_close(); // ne pas bloquer les autres requêtes pendant l'envoi

header('Content-Type: application/pdf');
header("Content-Disposition: inline; filename*=UTF-8''" . rawurlencode("$m $doc $f"));
header('Content-Length: ' . filesize($path));
header('Cache-Control: private, max-age=3600');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow');
readfile($path);
