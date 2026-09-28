<?php
define('_FVEILLEUX', 1);
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/session.php';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') errOut('Méthode non autorisée', 405);

$input  = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $input['action'] ?? '';

/* ── Limite d'essais : 8 mots de passe erronés par adresse IP en 15 minutes ── */
const MAX_ECHECS = 8, FENETRE = 900;
function essaisFichier(): string {
  return sys_get_temp_dir() . '/fv_login_' . hash('sha256', $_SERVER['REMOTE_ADDR'] ?? '?') . '.json';
}
function echecsRecents(): array {
  $f = essaisFichier();
  $t = is_file($f) ? (json_decode((string)@file_get_contents($f), true) ?: []) : [];
  return array_values(array_filter($t, fn($x) => is_int($x) && $x > time() - FENETRE));
}
function noterEchec(): void {
  $t = echecsRecents(); $t[] = time();
  @file_put_contents(essaisFichier(), json_encode($t), LOCK_EX);
}

switch ($action) {

  /* ── Connexion normale ── */
  case 'login':
    $uid  = strtolower(trim($input['userId'] ?? ''));
    $pass = $input['password'] ?? '';
    if (!$uid || !$pass) errOut('Champs manquants');
    if (count(echecsRecents()) >= MAX_ECHECS) errOut('Trop de tentatives. Réessayez dans 15 minutes.', 429);

    $pdo  = getPDO();
    $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$uid]);
    $user = $stmt->fetch();

    // un hachage fictif garde le même temps de réponse si l'identifiant n'existe pas
    $hash = $user['password_hash'] ?? '$2y$12$s4a3SyVQ72HqiSzh6KXqu.SbSygekfgTVa18Jt5dUyihnb9or2daa';
    if (!password_verify($pass, $hash) || !$user) {
      noterEchec();
      errOut('Identifiant ou mot de passe incorrect', 401);
    }
    @unlink(essaisFichier());

    // Coffre : les mots de passe définis avant l'ajout du coffre deviennent lisibles
    // par l'admin (avec 2FA) dès la prochaine connexion de la personne.
    try {
      $c = $pdo->prepare('SELECT 1 FROM documents WHERE collection_name=? AND doc_id=?');
      $c->execute(['_mdp', $user['id']]);
      if (!$c->fetch()) { require_once __DIR__ . '/coffre.php'; coffreEnregistrer($pdo, $user['id'], $pass); }
    } catch (Throwable $e) { error_log('fveilleux: coffre — ' . $e->getMessage()); }

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
    $_SESSION = [];
    session_destroy();
    $p = session_get_cookie_params();
    setcookie(session_name(), '', ['expires' => time() - 3600, 'path' => $p['path'], 'secure' => $p['secure'], 'httponly' => true, 'samesite' => $p['samesite'] ?: 'Lax']);
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
