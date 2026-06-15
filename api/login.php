<?php
define('_FVEILLEUX', 1);
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/session.php';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') errOut('Méthode non autorisée', 405);

$input  = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $input['action'] ?? '';

switch ($action) {

  /* ── Connexion normale ── */
  case 'login':
    $uid  = strtolower(trim($input['userId'] ?? ''));
    $pass = $input['password'] ?? '';
    if (!$uid || !$pass) errOut('Champs manquants');

    $pdo  = getPDO();
    $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$uid]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($pass, $user['password_hash'])) {
      errOut('Identifiant ou mot de passe incorrect', 401);
    }

    sessionInit();
    session_regenerate_id(true);
    $_SESSION['uid']          = $user['id'];
    $_SESSION['nom']          = $user['nom'];
    $_SESSION['role']         = $user['role'];
    $_SESSION['permissions']  = json_decode($user['permissions'] ?? '[]', true);
    $_SESSION['page_accueil'] = $user['page_accueil'] ?? 'dashboard.html';

    jsonOut([
      'ok'          => true,
      'nom'         => $user['nom'],
      'role'        => $user['role'],
      'permissions' => $_SESSION['permissions'],
      'pageAccueil' => $_SESSION['page_accueil'],
    ]);

  /* ── Invité ── */
  case 'guest':
    $pdo  = getPDO();
    $stmt = $pdo->prepare("SELECT data FROM documents WHERE collection_name='systeme' AND doc_id='config'");
    $stmt->execute();
    $row    = $stmt->fetch();
    $config = $row ? json_decode($row['data'], true) : [];
    $perms  = $config['guestPermissions'] ?? [];

    sessionInit();
    session_regenerate_id(true);
    $_SESSION['uid']          = 'guest';
    $_SESSION['nom']          = 'Invité';
    $_SESSION['role']         = 'guest';
    $_SESSION['permissions']  = $perms;
    $_SESSION['page_accueil'] = 'dashboard.html';

    jsonOut(['ok' => true, 'nom' => 'Invité', 'role' => 'guest', 'permissions' => $perms, 'pageAccueil' => 'dashboard.html']);

  /* ── Déconnexion ── */
  case 'logout':
    sessionInit();
    session_destroy();
    jsonOut(['ok' => true]);

  /* ── Session courante ── */
  case 'me':
    $s = getSession();
    if (!$s) jsonOut(['loggedIn' => false]);
    jsonOut([
      'loggedIn'    => true,
      'userId'      => $s['uid'],
      'nom'         => $s['nom'],
      'role'        => $s['role'],
      'permissions' => $s['permissions'],
      'pageAccueil' => $s['page_accueil'],
    ]);

  default:
    errOut('Action inconnue');
}
