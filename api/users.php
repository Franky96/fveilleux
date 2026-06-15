<?php
define('_FVEILLEUX', 1);
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/session.php';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

requireAdmin();

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
  jsonOut(['users' => $users]);
}

/* ── POST : créer ou modifier ── */
if ($method === 'POST') {
  $input    = json_decode(file_get_contents('php://input'), true) ?? [];
  $action   = $input['action'] ?? '';
  $targetId = $input['id']     ?? '';

  if ($action === 'save') {
    $uid      = strtolower(trim($input['userId']      ?? ''));
    $nom      = trim($input['nom']          ?? '');
    $role     = in_array($input['role'] ?? '', ['admin','user']) ? $input['role'] : 'user';
    $perms    = json_encode($input['permissions'] ?? []);
    $accueil  = $input['pageAccueil'] ?? 'dashboard.html';
    $newPass  = $input['motDePasse']  ?? '';

    if (!$uid || !$nom) errOut('Champs manquants');

    // Vérifier si l'utilisateur existe déjà
    $exists = $pdo->prepare('SELECT id FROM users WHERE id=?');
    $exists->execute([$uid]);

    if ($exists->fetch()) {
      // Mise à jour
      if ($newPass !== '') {
        $hash = password_hash($newPass, PASSWORD_BCRYPT);
        $pdo->prepare('UPDATE users SET nom=?, role=?, permissions=?, page_accueil=?, password_hash=? WHERE id=?')
            ->execute([$nom, $role, $perms, $accueil, $hash, $uid]);
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
    }

    jsonOut(['ok' => true]);
  }

  if ($action === 'delete') {
    if ($targetId === 'frank') errOut('Impossible de supprimer l\'administrateur principal');
    $pdo->prepare('DELETE FROM users WHERE id=?')->execute([$targetId]);
    jsonOut(['ok' => true]);
  }

  errOut('Action inconnue');
}

errOut('Méthode non autorisée', 405);
