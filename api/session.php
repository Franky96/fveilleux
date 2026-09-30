<?php
defined('_FVEILLEUX') or die('Accès direct interdit.');

// pas de messages d'erreur PHP (chemins, requêtes) dans les réponses
ini_set('display_errors', '0');

header('X-Content-Type-Options: nosniff');
// le navigateur retient d'utiliser HTTPS pour tout le site pendant un an
header('Strict-Transport-Security: max-age=31536000');
header('X-Frame-Options: DENY');
header('Referrer-Policy: same-origin');

// Envois limités à 2 Mo
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 2 * 1024 * 1024) {
  http_response_code(413);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(['error' => 'Données trop volumineuses']);
  exit;
}

// Les écritures n'acceptent que du JSON envoyé par le site : un formulaire
// d'un autre site ne peut pas produire cet en-tête sans autorisation (CORS).
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST'
    && stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) {
  http_response_code(415);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(['error' => 'Format de requête non accepté']);
  exit;
}

function sessionInit(): void {
  if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params([
      'lifetime' => 86400 * 30,
      'path'     => '/',
      'secure'   => true,
      'httponly' => true,
      'samesite' => 'Lax',
    ]);
    session_name('fv_sess');
    session_start();
  }
}

function requireLogin(): array {
  sessionInit();
  if (empty($_SESSION['uid'])) errOut('Non authentifié', 401);
  return $_SESSION;
}

function requireAdmin(): array {
  $s = requireLogin();
  if ($s['role'] !== 'admin') errOut('Accès refusé', 403);
  return $s;
}

function getSession(): ?array {
  sessionInit();
  return empty($_SESSION['uid']) ? null : $_SESSION;
}

/* Anciens noms de permissions → nom de la page qu'elles ouvrent (mêmes règles dans admin.js) */
const ANCIENNES_PERMISSIONS = ['loi39' => 'votes-quebec', 'qrlink' => 'qr-transfer', 'shapelink' => 'shape-transfer'];
function normaliserPermissions($perms): array {
  $out = [];
  foreach ((array)$perms as $p) if (is_string($p)) $out[] = ANCIENNES_PERMISSIONS[$p] ?? $p;
  return array_values(array_unique($out));
}
