<?php
defined('_FVEILLEUX') or die('Accès direct interdit.');

/*
 * Les identifiants de la base ne sont jamais versionnés (dépôt public).
 * Ils sont lus dans config/fveilleux-db.php, placé hors de public_html
 * (même niveau que le dossier « manuels »), qui retourne un tableau :
 *   <?php return ['host' => 'localhost', 'name' => '…', 'user' => '…', 'pass' => '…'];
 */
function dbConfig(): array {
  $docRoot = realpath($_SERVER['DOCUMENT_ROOT'] ?? '') ?: realpath(dirname(__DIR__));
  $dir = dirname($docRoot);
  while (true) {
    $file = $dir . '/config/fveilleux-db.php';
    if (is_file($file)) return require $file;
    $parent = dirname($dir);
    if ($parent === $dir) break;
    $dir = $parent;
  }
  error_log('fveilleux: config/fveilleux-db.php introuvable hors de la racine web');
  errOut('Configuration de la base de données introuvable sur le serveur.', 500);
}

$_dbCfg = dbConfig();
define('DB_HOST',    $_dbCfg['host'] ?? 'localhost');
define('DB_NAME',    $_dbCfg['name']);
define('DB_USER',    $_dbCfg['user']);
define('DB_PASS',    $_dbCfg['pass']);
define('DB_CHARSET', 'utf8mb4');
unset($_dbCfg);

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
