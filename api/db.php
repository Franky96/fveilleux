<?php
defined('_FVEILLEUX') or die('Accès direct interdit.');

define('DB_HOST',    'localhost');
define('DB_NAME',    'u715089735_fveilleux');
define('DB_USER',    'u715089735_admin');
define('DB_PASS',    'Veilleux9$SQL');
define('DB_CHARSET', 'utf8mb4');

function getPDO(): PDO {
  static $pdo = null;
  if ($pdo === null) {
    $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
      PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
      PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
  }
  return $pdo;
}

function jsonOut(array $data, int $status = 200): never {
  http_response_code($status);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($data, JSON_UNESCAPED_UNICODE);
  exit;
}

function errOut(string $msg, int $status = 400): never {
  jsonOut(['error' => $msg], $status);
}
