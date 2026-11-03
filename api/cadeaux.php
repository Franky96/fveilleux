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

$session = requireLogin(true);   // écrit dans la session (code d'accès, aperçus)
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

/* ---------- image et infos tirées du lien (aperçu) ----------
   Le serveur ouvre la page du produit et y cherche l'image que le site donne pour les partages (og:image,
   twitter:image, données Product en JSON-LD, image principale d'Amazon). Garde-fous : http ou https seulement,
   ports 80 et 443, adresses publiques seulement (jamais le serveur lui-même ni le réseau interne), adresse
   vérifiée à chaque redirection et imposée à curl (pas de changement de DNS entre la vérification et l'appel),
   8 s et quelques Mo au plus, 30 aperçus par 10 minutes et par session. Beaucoup de sites marchands bloquent
   les robots : sans image trouvée, on ajoute sa propre photo. */
function ipPublique(string $ip): bool { return (bool)filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE); }
function absolue(string $base, string $rel): string {
  $rel = trim(html_entity_decode($rel, ENT_QUOTES | ENT_HTML5));
  if ($rel === '' || preg_match('#^[a-z][a-z0-9+.-]*:#i', $rel)) return $rel;
  $b = parse_url($base);
  $orig = $b['scheme'] . '://' . $b['host'] . (isset($b['port']) ? ':' . $b['port'] : '');
  if (str_starts_with($rel, '//')) return $b['scheme'] . ':' . $rel;
  if (str_starts_with($rel, '/')) return $orig . $rel;
  $dir = preg_replace('#/[^/]*$#', '/', $b['path'] ?? '/');
  return $orig . $dir . $rel;
}
function telecharger(string $url, int $max, string $accepte): ?array {
  for ($saut = 0; $saut < 5; $saut++) {
    $u = parse_url($url);
    $sch = strtolower($u['scheme'] ?? '');
    $hote = strtolower(trim($u['host'] ?? '', '[]'));
    if (!in_array($sch, ['http', 'https'], true) || $hote === '' || isset($u['user'])) return null;
    $port = (int)($u['port'] ?? ($sch === 'https' ? 443 : 80));
    if (!in_array($port, [80, 443], true)) return null;
    $ips = filter_var($hote, FILTER_VALIDATE_IP) ? [$hote] : (gethostbynamel($hote) ?: []);
    if (!$ips) return null;
    foreach ($ips as $ip) if (!ipPublique($ip)) return null;
    $corps = ''; $trop = false;
    $c = curl_init($url);
    curl_setopt_array($c, [
      CURLOPT_RESOLVE => ["$hote:$port:{$ips[0]}"], CURLOPT_FOLLOWLOCATION => false, CURLOPT_HEADER => false,
      CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS, CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_TIMEOUT => 8,
      CURLOPT_ENCODING => '', CURLOPT_SSL_VERIFYPEER => true,
      CURLOPT_USERAGENT => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      CURLOPT_HTTPHEADER => ['Accept: ' . ($accepte === 'image' ? 'image/webp,image/jpeg,image/png,image/gif;q=0.9,image/*;q=0.5' : 'text/html,application/xhtml+xml,*/*;q=0.8'), 'Accept-Language: fr-CA,fr;q=0.9,en;q=0.7'],
      CURLOPT_WRITEFUNCTION => function ($ch, $bloc) use (&$corps, &$trop, $max) { $corps .= $bloc; if (strlen($corps) > $max) { $trop = true; return 0; } return strlen($bloc); },
    ]);
    curl_exec($c);
    $code = (int)curl_getinfo($c, CURLINFO_RESPONSE_CODE);
    $type = strtolower((string)curl_getinfo($c, CURLINFO_CONTENT_TYPE));
    $suite = (string)curl_getinfo($c, CURLINFO_REDIRECT_URL);
    curl_close($c);
    if ($code >= 300 && $code < 400 && $suite !== '') { $url = absolue($url, $suite); continue; }
    if ($code !== 200 || ($trop && $accepte === 'image')) return null;
    if ($accepte === 'image' ? !str_starts_with($type, 'image/') && !preg_match('/octet-stream/', $type) : !preg_match('/html|xml/', $type)) return null;
    return ['corps' => $corps, 'url' => $url];
  }
  return null;
}
function infosPage(string $html, string $base): array {
  $doc = new DOMDocument();
  @$doc->loadHTML('<?xml encoding="utf-8"?>' . $html, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
  $x = new DOMXPath($doc);
  $meta = function (array $noms) use ($x): string {
    foreach ($noms as $n) foreach ($x->query("//meta[@property='$n' or @name='$n' or @itemprop='$n']/@content") as $a) if (trim($a->value) !== '') return trim($a->value);
    return '';
  };
  $images = [];
  foreach (['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src', 'image'] as $n) { $v = $meta([$n]); if ($v !== '') $images[] = $v; }
  foreach ($x->query("//link[@rel='image_src']/@href") as $a) $images[] = $a->value;
  // Amazon : image principale (version haute définition, sinon la liste des tailles)
  foreach ($x->query("//img[@id='landingImage' or @id='imgBlkFront' or @id='main-image']") as $im) {
    if ($im->getAttribute('data-a-hires')) $images[] = $im->getAttribute('data-a-hires');
    if ($im->getAttribute('data-old-hires')) $images[] = $im->getAttribute('data-old-hires');
    $dyn = json_decode(html_entity_decode($im->getAttribute('data-a-dynamic-image')), true);
    if (is_array($dyn) && $dyn) $images[] = array_key_first($dyn);
    if ($im->getAttribute('src')) $images[] = $im->getAttribute('src');
  }
  // données structurées (Product) : image, nom, prix
  $titre = $meta(['og:title', 'twitter:title']); $prix = $meta(['product:price:amount', 'og:price:amount']); $devise = $meta(['product:price:currency', 'og:price:currency']);
  foreach ($x->query("//script[@type='application/ld+json']") as $s) {
    $j = json_decode(trim($s->textContent), true);
    if (!is_array($j)) continue;
    $pile = [$j];
    while ($pile) {
      $o = array_pop($pile);
      if (!is_array($o)) continue;
      $t = $o['@type'] ?? '';
      if ($t === 'Product' || (is_array($t) && in_array('Product', $t, true))) {
        $im = $o['image'] ?? null;
        if (is_string($im)) $images[] = $im; elseif (is_array($im)) { $p = $im[0] ?? $im; $images[] = is_array($p) ? ($p['url'] ?? '') : $p; }
        if ($titre === '' && is_string($o['name'] ?? null)) $titre = $o['name'];
        $of = $o['offers'] ?? null; if (is_array($of) && isset($of[0])) $of = $of[0];
        if ($prix === '' && is_array($of)) { $prix = (string)($of['price'] ?? $of['lowPrice'] ?? ''); $devise = $devise ?: (string)($of['priceCurrency'] ?? ''); }
      }
      foreach ($o as $v) if (is_array($v)) $pile[] = $v;
    }
  }
  if ($titre === '') { $t = $x->query('//title'); if ($t->length) $titre = $t->item(0)->textContent; }
  $titre = preg_replace('/\s*[:|–-]\s*Amazon\.(ca|com|fr)\b.*$/iu', '', $titre);
  if (preg_match('/template|access denied|accès refusé|robot|captcha|attention required|just a moment|page not found|introuvable/i', $titre)) $titre = '';
  $titre = texte(html_entity_decode(preg_replace('/\s+/', ' ', $titre), ENT_QUOTES | ENT_HTML5), 150);
  $prixTxt = '';
  if ($prix !== '' && is_numeric(str_replace(',', '.', $prix))) {
    $n = (float)str_replace(',', '.', $prix);
    $prixTxt = number_format($n, fmod($n, 1) ? 2 : 0, ',', ' ') . ' ' . (in_array(strtoupper($devise), ['', 'CAD', 'USD'], true) ? '$' : strtoupper($devise));
    if (strtoupper($devise) === 'USD') $prixTxt .= ' US';
  }
  $images = array_values(array_unique(array_filter(array_map(fn($u) => agrandir(absolue($base, (string)$u)), $images), fn($u) => preg_match('#^https?://#i', $u))));
  return ['images' => array_slice($images, 0, 4), 'titre' => $titre, 'prix' => $prixTxt];
}
// quelques sites donnent une petite image de partage : on demande la grande (Costco : width=350 → 1200)
function agrandir(string $u): string {
  if (preg_match('#^https://gdx-assets\.costco\.com/#i', $u)) {
    $u = preg_replace('/([?&])width=\d+/', '$1width=1200', $u);
    if (!preg_match('/[?&]width=/', $u)) $u .= (str_contains($u, '?') ? '&' : '?') . 'width=1200';
  }
  return $u;
}
// image (n'importe quel format lisible par GD) → JPEG de côté ≤ $max et de poids ≤ $octets, en base64
function versJpeg(GdImage $src, int $max, int $octets): string {
  $w = imagesx($src); $h = imagesy($src); $k = min(1, $max / max($w, $h));
  $nw = max(1, (int)round($w * $k)); $nh = max(1, (int)round($h * $k));
  $dst = imagecreatetruecolor($nw, $nh);
  imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255));
  imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
  for ($q = 85; ; $q -= 10) {
    ob_start(); imagejpeg($dst, null, $q); $bin = ob_get_clean();
    if (strlen($bin) <= $octets || $q <= 35) return base64_encode($bin);
  }
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

  case 'apercu':               // lien d'un produit → photo (enregistrée comme une photo envoyée), nom et prix proposés
    exigerOuvert();
    $t = array_values(array_filter((array)($_SESSION['cadeaux_apercus'] ?? []), fn($x) => is_int($x) && $x > time() - 600));
    if (count($t) >= 30) errOut('Trop de recherches d\'images. Réessaie dans quelques minutes.', 429);
    $t[] = time(); $_SESSION['cadeaux_apercus'] = $t;
    $lien = texte($in['lien'] ?? '', 2000);
    if ($lien !== '' && !preg_match('#^[a-z]+://#i', $lien)) $lien = 'https://' . $lien;
    if (!preg_match('#^https?://#i', $lien) || !filter_var($lien, FILTER_VALIDATE_URL)) errOut('Le lien ne semble pas valide');
    session_write_close();                                       // la recherche peut prendre quelques secondes : ne bloque pas les autres requêtes
    $page = telecharger($lien, 3000000, 'html');
    $infos = $page ? infosPage($page['corps'], $page['url']) : ['images' => [], 'titre' => '', 'prix' => ''];
    $id = null;
    foreach ($infos['images'] as $u) {
      $img = telecharger($u, 8000000, 'image');
      $gd = $img ? @imagecreatefromstring($img['corps']) : false;
      if (!$gd || imagesx($gd) < 80 || imagesy($gd) < 80) continue;      // pas les icônes ni les pixels de suivi
      $id = bin2hex(random_bytes(10));
      ecrireDoc(COL_PHOTOS, $id, ['t' => 'image/jpeg', 'b64' => versJpeg($gd, 1600, 1350000)], false);
      ecrireDoc(COL_PHOTOS, $id . '_m', ['t' => 'image/jpeg', 'b64' => versJpeg($gd, 480, 180000)], false);
      break;
    }
    jsonOut(['id' => $id, 'titre' => $infos['titre'], 'prix' => $infos['prix'], 'page' => $page !== null]);

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
