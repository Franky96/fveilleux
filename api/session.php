<?php
defined('_FVEILLEUX') or die('Accès direct interdit.');

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
