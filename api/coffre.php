<?php
defined('_FVEILLEUX') or die('Accès direct interdit.');

/*
 * Coffre des mots de passe et double authentification (2FA) des administrateurs.
 *
 * - La connexion vérifie toujours l'empreinte bcrypt (users.password_hash).
 * - Une copie chiffrée (AES-256-GCM) de chaque mot de passe défini depuis
 *   l'admin est gardée dans la collection « _mdp », que l'API de données
 *   ne sert jamais. La clé est dans config/fveilleux-cle.php, hors du site.
 * - La lecture exige un code TOTP (application d'authentification) et
 *   n'est déverrouillée que quelques minutes.
 * - Les secrets 2FA sont dans config/fveilleux-2fa.php, hors du site.
 *   Téléphone perdu : supprimer ce fichier dans le gestionnaire de fichiers
 *   Hostinger, puis reconfigurer la 2FA depuis la page Admin.
 */

const DEVERROUILLAGE_SECONDES = 300;

function configDir(): string {
  $docRoot = realpath($_SERVER['DOCUMENT_ROOT'] ?? '') ?: realpath(dirname(__DIR__));
  $dir = dirname($docRoot);
  while (true) {
    if (is_file($dir . '/config/fveilleux-db.php')) return $dir . '/config';
    $parent = dirname($dir);
    if ($parent === $dir) break;
    $dir = $parent;
  }
  throw new RuntimeException('Dossier de configuration introuvable sur le serveur.');
}

function configLire(string $nom): array {
  $f = configDir() . "/$nom.php";
  return is_file($f) ? (array)(require $f) : [];
}

function configEcrire(string $nom, array $data): void {
  $f = configDir() . "/$nom.php";
  $php = "<?php\n// Généré par le site — ne pas publier.\nreturn " . var_export($data, true) . ";\n";
  if (@file_put_contents($f, $php, LOCK_EX) === false) throw new RuntimeException("Impossible d'écrire $nom.php dans le dossier config.");
  @chmod($f, 0600);
  if (function_exists('opcache_invalidate')) @opcache_invalidate($f, true);
}

/* ── Chiffrement des mots de passe ── */
function cleCoffre(): string {
  $c = configLire('fveilleux-cle');
  if (empty($c['cle'])) {
    $c = ['cle' => base64_encode(random_bytes(32))];
    configEcrire('fveilleux-cle', $c);
  }
  return base64_decode($c['cle']);
}

function chiffrer(string $txt): string {
  $iv = random_bytes(12);
  $ct = openssl_encrypt($txt, 'aes-256-gcm', cleCoffre(), OPENSSL_RAW_DATA, $iv, $tag);
  return base64_encode($iv . $tag . $ct);
}

function dechiffrer(string $b64): ?string {
  $raw = base64_decode($b64, true);
  if ($raw === false || strlen($raw) < 29) return null;
  $txt = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', cleCoffre(), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
  return $txt === false ? null : $txt;
}

function coffreEnregistrer(PDO $pdo, string $uid, string $pass): void {
  $pdo->prepare('INSERT INTO documents (collection_name,doc_id,data) VALUES(?,?,?) ON DUPLICATE KEY UPDATE data=VALUES(data),updated_at=NOW()')
      ->execute(['_mdp', $uid, json_encode(['v' => chiffrer($pass), 't' => time()])]);
}

function coffreSupprimer(PDO $pdo, string $uid): void {
  $pdo->prepare('DELETE FROM documents WHERE collection_name=? AND doc_id=?')->execute(['_mdp', $uid]);
}

function coffreTout(PDO $pdo): array {
  $stmt = $pdo->prepare('SELECT doc_id, data FROM documents WHERE collection_name=?');
  $stmt->execute(['_mdp']);
  $out = [];
  foreach ($stmt->fetchAll() as $r) {
    $d = json_decode($r['data'], true);
    $p = isset($d['v']) ? dechiffrer($d['v']) : null;
    if ($p !== null) $out[$r['doc_id']] = ['mdp' => $p, 'depuis' => $d['t'] ?? null];
  }
  return $out;
}

/* ── TOTP (RFC 6238 : SHA-1, 30 s, 6 chiffres) ── */
function base32Encode(string $bin): string {
  $a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; $bits = ''; $out = '';
  foreach (str_split($bin) as $c) $bits .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT);
  foreach (str_split($bits, 5) as $chunk) $out .= $a[bindec(str_pad($chunk, 5, '0'))];
  return $out;
}

function base32Decode(string $b32): string {
  $a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; $bits = ''; $out = '';
  foreach (str_split(strtoupper(preg_replace('/[^A-Za-z2-7]/', '', $b32))) as $c) $bits .= str_pad(decbin(strpos($a, $c)), 5, '0', STR_PAD_LEFT);
  foreach (str_split($bits, 8) as $byte) if (strlen($byte) === 8) $out .= chr(bindec($byte));
  return $out;
}

function totpCode(string $secret, int $pas): string {
  $h = hash_hmac('sha1', pack('N2', 0, $pas), base32Decode($secret), true);
  $o = ord($h[19]) & 0x0f;
  $n = ((ord($h[$o]) & 0x7f) << 24) | (ord($h[$o + 1]) << 16) | (ord($h[$o + 2]) << 8) | ord($h[$o + 3]);
  return str_pad((string)($n % 1000000), 6, '0', STR_PAD_LEFT);
}

// Renvoie le pas de temps accepté (±30 s de tolérance), ou null
function totpVerifier(string $secret, string $code, int $dernierPas = 0): ?int {
  $code = preg_replace('/\D/', '', $code);
  if (strlen($code) !== 6) return null;
  $now = intdiv(time(), 30);
  for ($d = -1; $d <= 1; $d++) {
    $pas = $now + $d;
    if ($pas <= $dernierPas) continue;          // un code ne sert qu'une fois
    if (hash_equals(totpCode($secret, $pas), $code)) return $pas;
  }
  return null;
}

/* ── Limite d'essais des codes 2FA : 5 erreurs par 15 minutes ── */
function codeEssaisFichier(): string {
  return sys_get_temp_dir() . '/fv_2fa_' . hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '?') . session_id()) . '.json';
}
function codeBloque(): bool {
  $f = codeEssaisFichier();
  $t = is_file($f) ? (json_decode((string)@file_get_contents($f), true) ?: []) : [];
  return count(array_filter($t, fn($x) => is_int($x) && $x > time() - 900)) >= 5;
}
function codeEchec(): void {
  $f = codeEssaisFichier();
  $t = is_file($f) ? (json_decode((string)@file_get_contents($f), true) ?: []) : [];
  $t = array_values(array_filter($t, fn($x) => is_int($x) && $x > time() - 900)); $t[] = time();
  @file_put_contents($f, json_encode($t), LOCK_EX);
}

function deverrouilleJusqua(): int {
  return (int)($_SESSION['mdp_jusqua'] ?? 0);
}
