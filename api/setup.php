<?php
define('_FVEILLEUX', 1);
require_once __DIR__ . '/db.php';

// Accès uniquement avec le token de setup
$token    = $_GET['token'] ?? '';
$expected = 'fv_' . substr(md5(DB_PASS . DB_NAME), 0, 12);
if ($token !== $expected) {
  http_response_code(403);
  die(json_encode(['error' => 'Token invalide']));
}

header('Content-Type: application/json; charset=utf-8');

$pdo = getPDO();
$log = [];

/* ── Table documents (remplace Firestore) ── */
$pdo->exec("CREATE TABLE IF NOT EXISTS documents (
  collection_name VARCHAR(100) NOT NULL,
  doc_id          VARCHAR(200) NOT NULL,
  data            JSON         NOT NULL,
  created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (collection_name, doc_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
$log[] = 'Table documents : OK';

/* ── Table users ── */
$pdo->exec("CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(50)  NOT NULL,
  nom           VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('admin','user','guest') DEFAULT 'user',
  permissions   JSON,
  page_accueil  VARCHAR(100) DEFAULT 'dashboard.html',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
$log[] = 'Table users : OK';

/* ── Créer l'admin par défaut si vide ── */
$count = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
if ($count === 0) {
  $hash  = password_hash('Biere42', PASSWORD_BCRYPT);
  $perms = json_encode(['ena','aviation','bieres','scifi','hockey','aeronefs','films','liens','rona','jeuxdesociete','informatique','osint','pageTest','webmail','admin']);
  $pdo->prepare('INSERT INTO users (id,nom,password_hash,role,permissions,page_accueil) VALUES(?,?,?,?,?,?)')
      ->execute(['frank','Francis',$hash,'admin',$perms,'dashboard.html']);
  $log[] = 'Utilisateur admin "frank" créé (mot de passe : Biere42)';
} else {
  $log[] = "Utilisateurs existants conservés ($count)";
}

echo json_encode(['ok' => true, 'log' => $log, 'token_hint' => $expected], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
