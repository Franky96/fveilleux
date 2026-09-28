<?php
defined('_FVEILLEUX') or die('Accès direct interdit.');

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: same-origin');

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
