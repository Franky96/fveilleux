<?php
define('_FVEILLEUX', 1);
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/session.php';
require_once __DIR__ . '/coffre.php';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

$admin = requireAdmin();
// erreurs du coffre (dossier config, clé…) : message clair plutôt qu'une page d'erreur
set_exception_handler(function (Throwable $e) {
  error_log('fveilleux: users — ' . $e->getMessage());
  errOut($e instanceof RuntimeException ? $e->getMessage() : 'Erreur serveur', 500);
});
$moi   = (string)$admin['uid'];

$method = $_SERVER['REQUEST_METHOD'];
$pdo    = getPDO();

/* ── GET : liste de tous les utilisateurs ── */
if ($method === 'GET') {
  $stmt  = $pdo->query('SELECT id, nom, role, permissions, page_accueil FROM users ORDER BY role DESC, nom ASC');
  $users = [];
  foreach ($stmt->fetchAll() as $u) {
    $users[$u['id']] = [
      'nom'         => $u['nom'],
      'role'        => $u['role'],
      'permissions' => json_decode($u['permissions'] ?? '[]', true),
      'pageAccueil' => $u['page_accueil'],
      'motDePasse'  => '', // jamais renvoyé
    ];
  }
  $out = ['users' => $users];

  // Mots de passe : seulement pendant un déverrouillage 2FA en cours
  if (isset($_GET['mdp'])) {
    if (deverrouilleJusqua() < time()) errOut('Lecture des mots de passe verrouillée', 403);
    $out['motsDePasse'] = coffreTout($pdo);
    $out['jusqua'] = deverrouilleJusqua();
  }
  jsonOut($out);
}

/* ── POST : créer ou modifier ── */
if ($method === 'POST') {
  $input    = json_decode(file_get_contents('php://input'), true) ?? [];
  $action   = $input['action'] ?? '';
  $targetId = $input['id']     ?? '';

  /* ── Double authentification et coffre ── */
  if ($action === '2fa_etat') {
    $s2 = configLire('fveilleux-2fa');
    jsonOut(['active' => !empty($s2[$moi]['secret']), 'jusqua' => max(0, deverrouilleJusqua() - time())]);
  }
  if ($action === '2fa_init') {
    $s2 = configLire('fveilleux-2fa');
    if (!empty($s2[$moi]['secret'])) errOut('La double authentification est déjà configurée.');
    $secret = base32Encode(random_bytes(20));
    $_SESSION['2fa_attente'] = $secret;
    $uri = 'otpauth://totp/' . rawurlencode('fveilleux.com:' . $moi) . '?secret=' . $secret . '&issuer=fveilleux.com&algorithm=SHA1&digits=6&period=30';
    jsonOut(['secret' => $secret, 'uri' => $uri]);
  }
  if ($action === '2fa_activer') {
    $secret = $_SESSION['2fa_attente'] ?? '';
    if (!$secret) errOut('Recommence la configuration.');
    if (codeBloque()) errOut('Trop d\'essais. Réessaie dans 15 minutes.', 429);
    $pas = totpVerifier($secret, (string)($input['code'] ?? ''));
    if ($pas === null) { codeEchec(); errOut('Code incorrect. Vérifie l\'heure du téléphone et réessaie.', 401); }
    $s2 = configLire('fveilleux-2fa');
    $s2[$moi] = ['secret' => $secret, 'dernier' => 0, 'depuis' => time()];
    configEcrire('fveilleux-2fa', $s2);
    unset($_SESSION['2fa_attente']);
    jsonOut(['ok' => true]);
  }
  if ($action === 'deverrouiller') {
    $s2 = configLire('fveilleux-2fa');
    if (empty($s2[$moi]['secret'])) errOut('Configure d\'abord la double authentification.', 400);
    if (codeBloque()) errOut('Trop d\'essais. Réessaie dans 15 minutes.', 429);
    $pas = totpVerifier($s2[$moi]['secret'], (string)($input['code'] ?? ''), (int)($s2[$moi]['dernier'] ?? 0));
    if ($pas === null) { codeEchec(); errOut('Code incorrect ou déjà utilisé : attends le code suivant.', 401); }
    $s2[$moi]['dernier'] = $pas;
    configEcrire('fveilleux-2fa', $s2);
    $_SESSION['mdp_jusqua'] = time() + DEVERROUILLAGE_SECONDES;
    jsonOut(['ok' => true, 'jusqua' => DEVERROUILLAGE_SECONDES]);
  }
  if ($action === 'verrouiller') {
    unset($_SESSION['mdp_jusqua']);
    jsonOut(['ok' => true]);
  }

  if ($action === 'save') {
    $uid      = strtolower(trim($input['userId']      ?? ''));
    $nom      = trim($input['nom']          ?? '');
    $role     = in_array($input['role'] ?? '', ['admin','user']) ? $input['role'] : 'user';
    $perms    = json_encode($input['permissions'] ?? []);
    $accueil  = $input['pageAccueil'] ?? 'dashboard.html';
    $newPass  = $input['motDePasse']  ?? '';
    if ($newPass !== '' && mb_strlen($newPass) < 8) errOut('Mot de passe trop court (8 caractères minimum)');

    if (!$uid || !$nom) errOut('Champs manquants');
    // identifiant simple : lettres, chiffres, point, tiret, soulignement
    if (!preg_match('/^[a-z0-9._-]{1,40}$/', $uid)) errOut('Identifiant invalide (lettres, chiffres, . _ - seulement)');
    if (mb_strlen($nom) > 60) errOut('Nom trop long');
    if (!preg_match('/^[a-z0-9_-]+\.html$/', $accueil)) $accueil = 'dashboard.html';
    $perms = json_encode(array_values(array_filter((array)($input['permissions'] ?? []), fn($p) => is_string($p) && preg_match('/^[A-Za-z0-9_-]{1,40}$/', $p))));

    // Vérifier si l'utilisateur existe déjà
    $exists = $pdo->prepare('SELECT id FROM users WHERE id=?');
    $exists->execute([$uid]);

    if ($exists->fetch()) {
      // Mise à jour
      if ($newPass !== '') {
        $hash = password_hash($newPass, PASSWORD_BCRYPT);
        $pdo->prepare('UPDATE users SET nom=?, role=?, permissions=?, page_accueil=?, password_hash=? WHERE id=?')
            ->execute([$nom, $role, $perms, $accueil, $hash, $uid]);
        try { coffreEnregistrer($pdo, $uid, $newPass); } catch (Throwable $e) { $avert = 'Mot de passe enregistré, mais pas sa copie lisible : ' . $e->getMessage(); }
      } else {
        $pdo->prepare('UPDATE users SET nom=?, role=?, permissions=?, page_accueil=? WHERE id=?')
            ->execute([$nom, $role, $perms, $accueil, $uid]);
      }
    } else {
      // Création
      if ($newPass === '') errOut('Mot de passe requis pour un nouvel utilisateur');
      $hash = password_hash($newPass, PASSWORD_BCRYPT);
      $pdo->prepare('INSERT INTO users (id,nom,password_hash,role,permissions,page_accueil) VALUES(?,?,?,?,?,?)')
          ->execute([$uid, $nom, $hash, $role, $perms, $accueil]);
      try { coffreEnregistrer($pdo, $uid, $newPass); } catch (Throwable $e) { $avert = 'Mot de passe enregistré, mais pas sa copie lisible : ' . $e->getMessage(); }
    }

    jsonOut(['ok' => true] + (isset($avert) ? ['avertissement' => $avert] : []));
  }

  if ($action === 'delete') {
    if ($targetId === 'frank') errOut('Impossible de supprimer l\'administrateur principal');
    $pdo->prepare('DELETE FROM users WHERE id=?')->execute([$targetId]);
    coffreSupprimer($pdo, (string)$targetId);
    jsonOut(['ok' => true]);
  }

  errOut('Action inconnue');
}

errOut('Méthode non autorisée', 405);
