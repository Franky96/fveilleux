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
    // la session vit aussi longtemps que son témoin (30 jours) : sinon le serveur l'oubliait après ~24 min sans visite
    // et, depuis le contrôle des pages (api/page.php), renvoyait à la connexion
    ini_set('session.gc_maxlifetime', (string)(86400 * 30));
    session_name('fv_sess');
    session_start();
  }
}

// La session est relâchée dès qu'elle est lue (session_write_close) : PHP la verrouille tant qu'elle est ouverte,
// et un relais qui attend un autre site (usa.php, jusqu'à 20 s) bloquait toutes les autres requêtes de la même
// personne, chacune gardant un processus PHP : l'hébergeur répondait alors « 503 » à tout le monde (3 novembre 2026).
// Seuls les scripts qui écrivent dans la session la gardent ouverte ($garder = true : cadeaux.php, users.php).
function requireLogin(bool $garder = false): array {
  sessionInit();
  if (empty($_SESSION['uid'])) { session_write_close(); errOut('Non authentifié', 401); }
  $s = $_SESSION;
  if (!$garder) session_write_close();
  return $s;
}

function requireAdmin(bool $garder = false): array {
  $s = requireLogin($garder);
  if ($s['role'] !== 'admin') errOut('Accès refusé', 403);
  return $s;
}

function getSession(): ?array {
  sessionInit();
  $s = empty($_SESSION['uid']) ? null : $_SESSION;
  session_write_close();
  return $s;
}

/* Anciens noms de permissions → nom de la page qu'elles ouvrent (mêmes règles dans admin.js) */
const ANCIENNES_PERMISSIONS = ['loi39' => 'votes-quebec', 'qrlink' => 'qr-transfer', 'shapelink' => 'shape-transfer'];
function normaliserPermissions($perms): array {
  $out = [];
  foreach ((array)$perms as $p) if (is_string($p)) $out[] = ANCIENNES_PERMISSIONS[$p] ?? $p;
  return array_values(array_unique($out));
}
