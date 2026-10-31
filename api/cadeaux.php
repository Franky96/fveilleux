<?php
/*
 * Listes de cadeaux (cadeaux.html) : une liste par personne, partagée par tous ceux qui ont le code.
 *
 * Accès : session du site avec la permission « cadeaux » (comptes ou bouton invité, selon l'admin),
 * puis le code d'accès de la page, vérifié ici (hachage bcrypt dans _cadeaux/config ; 8 essais
 * ratés par adresse IP en 15 minutes). L'administrateur passe sans code et définit le code.
 * Contrairement à data.php, les invités qui ont le code peuvent écrire : c'est le but de la page.
 *
 * Stockage dans la table documents (collections « _ », jamais servies par data.php) :
 *   _cadeaux/config          { hash }
 *   _cadeaux/listes          { v, personnes: [ { id, nom, items: [ { id, titre, lien, prix, notes, coeur, photos[], cree, modif } ] } ] }
 *   _cadeaux_photos/<id>     { t, b64 }   photo réduite dans le navigateur (1600 px)
 *   _cadeaux_photos/<id>_m   { t, b64 }   vignette (480 px)
 * Les écritures passent par un verrou de fichier : deux personnes qui ajoutent en même temps ne s'écrasent pas.
 */
define('_FVEILLEUX', 1);
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/session.php';

header('Cache-Control: no-store');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

$session = requireLogin();
$isAdmin = ($session['role'] ?? '') === 'admin';
$perms   = is_array($session['permissions'] ?? null) ? $session['permissions'] : [];
if (!$isAdmin && !in_array('cadeaux', $perms, true)) errOut('Accès refusé', 403);

const COL = '_cadeaux', COL_PHOTOS = '_cadeaux_photos';
const MAX_ECHECS = 8, FENETRE = 900;

/* ---------- documents ---------- */
function lireDoc(string $col, string $id): ?array {
  $s = getPDO()->prepare('SELECT data FROM documents WHERE collection_name=? AND doc_id=?');
  $s->execute([$col, $id]);
  $r = $s->fetch();
  return $r ? (json_decode($r['data'], true) ?: []) : null;
}
function ecrireDoc(string $col, string $id, array $data, bool $existe): void {
  $json = json_encode($data, JSON_UNESCAPED_UNICODE);
  if ($existe) getPDO()->prepare('UPDATE documents SET data=? WHERE collection_name=? AND doc_id=?')->execute([$json, $col, $id]);
  else getPDO()->prepare('INSERT INTO documents (collection_name, doc_id, data) VALUES (?, ?, ?)')->execute([$col, $id, $json]);
}
function effacerDoc(string $col, string $id): void {
  getPDO()->prepare('DELETE FROM documents WHERE collection_name=? AND doc_id=?')->execute([$col, $id]);
}

/* ---------- code d'accès ---------- */
function config(): array { return lireDoc(COL, 'config') ?? []; }
function empreinteCode(array $cfg): string { return isset($cfg['hash']) ? substr(hash('sha256', $cfg['hash']), 0, 16) : ''; }
function ouvert(): bool {
  global $isAdmin;
  if ($isAdmin) return true;
  $e = empreinteCode(config());
  return $e !== '' && ($_SESSION['cadeaux'] ?? '') === $e;      // un nouveau code ferme les anciennes sessions
}
function exigerOuvert(): void { if (!ouvert()) errOut('Code requis', 403); }
function essaisFichier(): string { return sys_get_temp_dir() . '/fv_cadeaux_' . hash('sha256', $_SERVER['REMOTE_ADDR'] ?? '?') . '.json'; }
function echecsRecents(): array {
  $f = essaisFichier();
  $t = is_file($f) ? (json_decode((string)@file_get_contents($f), true) ?: []) : [];
  return array_values(array_filter($t, fn($x) => is_int($x) && $x > time() - FENETRE));
}
function noterEchec(): void { $t = echecsRecents(); $t[] = time(); @file_put_contents(essaisFichier(), json_encode($t), LOCK_EX); }

/* ---------- listes ---------- */
function verrou() {
  $f = fopen(sys_get_temp_dir() . '/fv_cadeaux.lock', 'c');
  if (!$f || !flock($f, LOCK_EX)) errOut('Serveur occupé, réessaie', 503);
  return $f;
}
function listes(): array {
  $d = lireDoc(COL, 'listes');
  return ['existe' => $d !== null, 'data' => ['v' => (int)($d['v'] ?? 0), 'personnes' => $d['personnes'] ?? []]];
}
function reponse(array $d): never { jsonOut(['v' => $d['v'], 'personnes' => $d['personnes']]); }
// modifie les listes sous verrou, puis renvoie les listes à jour ; $f reçoit les personnes par référence
function modifier(callable $f): never {
  $v = verrou();
  $l = listes();
  $d = $l['data'];
  $f($d['personnes']);
  trierPersonnes($d['personnes']);
  $d['v']++;
  ecrireDoc(COL, 'listes', $d, $l['existe']);
  flock($v, LOCK_UN);
  reponse($d);
}
// les noms restent toujours en ordre alphabétique (demande de l'utilisateur), sans tenir compte des accents ni des majuscules
function cleTri(string $nom): string {
  $t = function_exists('iconv') ? @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $nom) : false;
  return mb_strtolower($t !== false && $t !== '' ? $t : $nom);
}
function trierPersonnes(array &$ps): void {
  if (class_exists('Collator')) { $c = new Collator('fr_CA'); $c->setAttribute(Collator::NUMERIC_COLLATION, Collator::ON); usort($ps, fn($a, $b) => $c->compare($a['nom'] ?? '', $b['nom'] ?? '')); }
  else usort($ps, fn($a, $b) => strnatcmp(cleTri($a['nom'] ?? ''), cleTri($b['nom'] ?? '')));
}
function nouvelId(string $p): string { return $p . bin2hex(random_bytes(6)); }
function texte($v, int $max): string { return mb_substr(trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', (string)$v)), 0, $max); }
function &trouverPersonne(array &$ps, string $id): array {
  foreach ($ps as &$p) if (($p['id'] ?? '') === $id) return $p;
  errOut('Personne introuvable (supprimée par quelqu\'un d\'autre ?)', 404);
}
function photosDe(array $items): array { $t = []; foreach ($items as $it) foreach ($it['photos'] ?? [] as $ph) $t[] = $ph; return $t; }
function effacerPhotos(array $ids): void { foreach ($ids as $id) { effacerDoc(COL_PHOTOS, $id); effacerDoc(COL_PHOTOS, $id . '_m'); } }
function nettoyerItem(array $in): array {
  $titre = texte($in['titre'] ?? '', 150);
  $lien  = texte($in['lien'] ?? '', 2000);
  if ($lien !== '' && !preg_match('#^[a-z]+://#i', $lien)) $lien = 'https://' . $lien;
  if ($lien !== '' && (!preg_match('#^https?://#i', $lien) || !filter_var($lien, FILTER_VALIDATE_URL))) errOut('Le lien ne semble pas valide');
  if ($titre === '' && $lien !== '') $titre = preg_replace('/^www\./', '', (string)parse_url($lien, PHP_URL_HOST));
  if ($titre === '') errOut('Donne au moins un nom au cadeau');
  $photos = [];
  foreach ((array)($in['photos'] ?? []) as $ph) {
    if (is_string($ph) && preg_match('/^[a-f0-9]{20}$/', $ph) && !in_array($ph, $photos, true) && lireDoc(COL_PHOTOS, $ph . '_m') !== null) $photos[] = $ph;
  }
  return ['titre' => $titre, 'lien' => $lien, 'prix' => texte($in['prix'] ?? '', 40), 'notes' => texte($in['notes'] ?? '', 3000),
          'coeur' => !empty($in['coeur']), 'photos' => array_slice($photos, 0, 8)];
}

/* ══════════════ GET ══════════════ */
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  if (isset($_GET['etat'])) jsonOut(['ouvert' => ouvert(), 'codeDefini' => isset(config()['hash']), 'admin' => $isAdmin]);

  if (isset($_GET['liste'])) {
    exigerOuvert();
    $d = listes()['data'];
    if (isset($_GET['v']) && (int)$_GET['v'] === $d['v']) jsonOut(['v' => $d['v'], 'inchange' => true]);
    reponse($d);
  }

  if (isset($_GET['photo'])) {
    exigerOuvert();
    $id = (string)$_GET['photo'];
    if (!preg_match('/^[a-f0-9]{20}$/', $id)) errOut('Photo inconnue', 404);
    $ph = lireDoc(COL_PHOTOS, $id . (isset($_GET['m']) ? '_m' : ''));
    if (!$ph || !in_array($ph['t'] ?? '', ['image/jpeg', 'image/png', 'image/webp'], true)) errOut('Photo inconnue', 404);
    $bin = base64_decode($ph['b64'] ?? '', true);
    if ($bin === false) errOut('Photo illisible', 500);
    header_remove('Cache-Control');
    header('Cache-Control: private, max-age=31536000, immutable');   // une photo ne change jamais (nouvel envoi = nouvel identifiant)
    header('Content-Type: ' . $ph['t']);
    header('Content-Length: ' . strlen($bin));
    echo $bin;
    exit;
  }
  errOut('Requête inconnue');
}

/* ══════════════ POST ══════════════ */
if ($_SERVER['REQUEST_METHOD'] !== 'POST') errOut('Méthode non autorisée', 405);
$in = json_decode(file_get_contents('php://input'), true);
if (!is_array($in)) errOut('Requête invalide');

switch ((string)($in['action'] ?? '')) {

  case 'code':
    $cfg = config();
    if (!isset($cfg['hash'])) errOut("Le code de la page n'a pas encore été choisi.", 409);
    if (count(echecsRecents()) >= MAX_ECHECS) errOut('Trop d\'essais. Réessaie dans 15 minutes.', 429);
    if (!password_verify((string)($in['code'] ?? ''), $cfg['hash'])) { noterEchec(); errOut('Code incorrect', 401); }
    @unlink(essaisFichier());
    $_SESSION['cadeaux'] = empreinteCode($cfg);
    reponse(listes()['data']);

  case 'definirCode':
    if (!$isAdmin) errOut('Accès refusé', 403);
    $code = trim((string)($in['code'] ?? ''));
    if (mb_strlen($code) < 4 || mb_strlen($code) > 64) errOut('Le code doit avoir de 4 à 64 caractères');
    ecrireDoc(COL, 'config', ['hash' => password_hash($code, PASSWORD_DEFAULT)], lireDoc(COL, 'config') !== null);
    jsonOut(['ok' => true]);

  case 'personne':
    exigerOuvert();
    $op = (string)($in['op'] ?? '');
    modifier(function (array &$ps) use ($in, $op) {
      if ($op === 'ajouter') {
        $nom = texte($in['nom'] ?? '', 60);
        if ($nom === '') errOut('Donne un nom');
        if (count($ps) >= 100) errOut('Trop de personnes');
        $ps[] = ['id' => nouvelId('p'), 'nom' => $nom, 'items' => []];
      } elseif ($op === 'renommer') {
        $nom = texte($in['nom'] ?? '', 60);
        if ($nom === '') errOut('Donne un nom');
        $p = &trouverPersonne($ps, (string)($in['id'] ?? ''));
        $p['nom'] = $nom;
      } elseif ($op === 'supprimer') {
        $id = (string)($in['id'] ?? '');
        $p = trouverPersonne($ps, $id);
        effacerPhotos(photosDe($p['items'] ?? []));
        $ps = array_values(array_filter($ps, fn($x) => ($x['id'] ?? '') !== $id));
      } else errOut('Opération inconnue');
    });

  case 'item':
    exigerOuvert();
    $op = (string)($in['op'] ?? '');
    modifier(function (array &$ps) use ($in, $op) {
      $p = &trouverPersonne($ps, (string)($in['personne'] ?? ''));
      $p['items'] = $p['items'] ?? [];
      if ($op === 'ajouter') {
        if (count($p['items']) >= 200) errOut('Trop de cadeaux pour cette personne');
        $p['items'][] = ['id' => nouvelId('i')] + nettoyerItem((array)($in['item'] ?? [])) + ['cree' => time(), 'modif' => time()];
        return;
      }
      $id = (string)($in['id'] ?? '');
      foreach ($p['items'] as $k => &$it) {
        if (($it['id'] ?? '') !== $id) continue;
        if ($op === 'modifier') {
          $neuf = nettoyerItem((array)($in['item'] ?? []));
          effacerPhotos(array_diff($it['photos'] ?? [], $neuf['photos']));
          $it = ['id' => $id] + $neuf + ['cree' => $it['cree'] ?? time(), 'modif' => time()];
        } elseif ($op === 'supprimer') {
          effacerPhotos($it['photos'] ?? []);
          unset($p['items'][$k]);
          $p['items'] = array_values($p['items']);
        } else errOut('Opération inconnue');
        return;
      }
      errOut('Cadeau introuvable (supprimé par quelqu\'un d\'autre ?)', 404);
    });

  case 'photo':
    exigerOuvert();
    $t = (string)($in['t'] ?? '');
    if (!in_array($t, ['image/jpeg', 'image/png', 'image/webp'], true)) errOut('Format de photo non accepté');
    $ok = function ($b64, int $max) use ($t) {
      $bin = base64_decode((string)$b64, true);
      if ($bin === false || strlen($bin) > $max) return false;
      $info = @getimagesizefromstring($bin);
      return $info && $info['mime'] === $t;
    };
    if (!$ok($in['b64'] ?? '', 1400000) || !$ok($in['m'] ?? '', 200000)) errOut('Photo illisible ou trop lourde');
    $id = bin2hex(random_bytes(10));
    ecrireDoc(COL_PHOTOS, $id, ['t' => $t, 'b64' => $in['b64']], false);
    ecrireDoc(COL_PHOTOS, $id . '_m', ['t' => $t, 'b64' => $in['m']], false);
    jsonOut(['id' => $id]);

  case 'photoAnnuler':          // photo envoyée puis abandonnée (formulaire annulé) : effacée si aucun cadeau ne l'utilise
    exigerOuvert();
    $id = (string)($in['id'] ?? '');
    if (!preg_match('/^[a-f0-9]{20}$/', $id)) errOut('Photo inconnue');
    $v = verrou();
    $utilisees = [];
    foreach (listes()['data']['personnes'] as $p) $utilisees = array_merge($utilisees, photosDe($p['items'] ?? []));
    if (!in_array($id, $utilisees, true)) effacerPhotos([$id]);
    flock($v, LOCK_UN);
    jsonOut(['ok' => true]);

  default:
    errOut('Action inconnue');
}
