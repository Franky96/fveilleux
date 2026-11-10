<?php
/*
 * Contrôle des pages par le serveur (demande de l'utilisateur, 3 novembre 2026).
 * Le .htaccess de la racine envoie ici chaque page .html de la racine (et de concept/), sauf index.html :
 *   pas connecté                 → redirigé vers index.html (la connexion)
 *   connecté sans la permission  → redirigé vers dashboard.html
 *   sinon                        → la page est servie telle quelle.
 * Les permissions viennent de la session PHP ouverte à la connexion (api/login.php) : les mêmes que
 * celles du navigateur, le compte invité compris (permissions invité réglées dans admin).
 * Une page absente de PAGES (et des MOTIFS) n'est ouverte qu'à l'admin : **toute nouvelle page va dans PAGES**.
 */
define('_FVEILLEUX', 1);
require_once __DIR__ . '/session.php';

// page → permissions qui l'ouvrent (une seule suffit). 'connecte' : toute personne connectée ;
// 'pas-invite' : toute personne connectée sauf le compte invité ; [] : l'admin seulement.
const PAGES = [
  'dashboard.html'        => 'connecte',
  'archive.html'          => 'pas-invite',
  'concept.html'          => 'pas-invite',
  'concept/index.html'    => 'pas-invite', 'concept/arinc429.html' => 'pas-invite', 'concept/aviation.html' => 'pas-invite',
  'concept/csdb.html'     => 'pas-invite', 'concept/informatique.html' => 'pas-invite',
  'admin.html'            => [],
  // Moteurs
  'moteurs.html'          => ['moteurs', 'turboreacteur', 'pt6a21', 'planetaire', 'pompe-engrenages', 'helice', 'pw1500g', 'o320'],
  'pt6a21.html'           => ['pt6a21', 'moteurs'],
  'o320.html'             => ['o320', 'moteurs'],
  'turboreacteur.html'    => ['turboreacteur', 'moteurs'],
  'pw1500g.html'          => ['pw1500g', 'moteurs'],
  'planetaire.html'       => ['planetaire', 'moteurs'],
  'pompe-engrenages.html' => ['pompe-engrenages', 'moteurs'],
  'helice.html'           => ['helice', 'moteurs'],
  // Aviation
  'aviation.html'         => ['aviation'],
  'aeronefs.html'         => ['aeronefs', 'aviation'],
  'ena.html'              => ['ena'],
  // Informatique
  'informatique.html'     => ['informatique', 'arinc429', 'csdb', 'converter', 'crypteur', 'tcpip', 'qr-transfer', 'shape-transfer', 'chips', 'circuit', 'triphase', 'tcas', 'radalt', 'radar-meteo'],
  'arinc429.html'         => ['arinc429', 'informatique'],
  'csdb.html'             => ['csdb', 'informatique'],
  'converter.html'        => ['converter', 'informatique'],
  'crypteur.html'         => ['crypteur', 'informatique'],
  'tcpip.html'            => ['tcpip', 'informatique'],
  'qr-transfer.html'      => ['qr-transfer', 'informatique'],
  'shape-transfer.html'   => ['shape-transfer', 'informatique'],
  'chips.html'            => ['chips', 'informatique'],
  'circuit.html'          => ['circuit', 'informatique'],
  'triphase.html'         => ['triphase', 'informatique'],
  'tcas.html'             => ['tcas', 'informatique'],
  'radalt.html'           => ['radalt', 'informatique'],
  'radar-meteo.html'      => ['radar-meteo', 'informatique'],
  'distant.html'          => ['distant'],
  'aec-avionique.html'    => ['aec-avionique'],
  // Politique et monde
  'information-monde.html'=> ['monde'],
  'osint.html'            => ['osint'],
  'heure-ete-hiver.html'  => ['heure'],
  // Jeux de société
  'jeuxdesociete.html'    => ['jeuxdesociete', '7wonders', 'qwirkle', 'tickettoride', 'flip7', 'ladamepique', 'compteurgeneral'],
  '7wonders.html'         => ['7wonders', 'jeuxdesociete'],
  'qwirkle.html'          => ['qwirkle', 'jeuxdesociete'],
  'tickettoride.html'     => ['tickettoride', 'jeuxdesociete'],
  'tickettoride-rs.html'  => ['tickettoride', 'jeuxdesociete'],
  'flip7.html'            => ['flip7', 'jeuxdesociete'],
  'ladamepique.html'      => ['ladamepique', 'jeuxdesociete'],
  'compteurgeneral.html'  => ['compteurgeneral', 'jeuxdesociete'],
  // Loisirs, travail
  'cadeaux.html'          => ['cadeaux'],
  'films.html'            => ['films'],
  'hockey.html'           => ['hockey'],
  'bieres.html'           => ['bieres'],
  'scifi.html'            => ['scifi'],
  'rona.html'             => ['rona'],
  'liens.html'            => ['liens'],
  'pageTest.html'         => ['pageTest'],
];
// Section Intentions de vote et En direct (pages générées par pages.py, nouvelles soirées comprises)
const MOTIFS = [
  '#^(votes-[a-z0-9-]+|en-direct(-[a-z0-9-]+)?|election-[a-z0-9-]+|referendum-[a-z0-9-]+|loi39|intentions-simulations)\.html$#' => ['votes-quebec'],
];

function regle(string $p) {
  if (array_key_exists($p, PAGES)) return PAGES[$p];
  foreach (MOTIFS as $m => $r) if (preg_match($m, $p)) return $r;
  return [];
}

function aller(string $ou): void {
  header('Cache-Control: no-store');
  header('Location: /' . $ou, true, 302);
  exit;
}

$p = (string)($_GET['p'] ?? '');
$racine = realpath(dirname(__DIR__));
$fichier = preg_match('#^(concept/)?[A-Za-z0-9_-]+\.html$#', $p) ? realpath($racine . '/' . $p) : false;
if (!$fichier || strpos($fichier, $racine . DIRECTORY_SEPARATOR) !== 0 || !is_file($fichier)) {
  http_response_code(404);
  header('Content-Type: text/plain; charset=utf-8');
  exit('Page introuvable');
}

$s = getSession();
if (!$s) aller('index.html');
$role  = $s['role'] ?? '';
$perms = is_array($s['permissions'] ?? null) ? $s['permissions'] : [];
$r = regle($p);
$ok = $role === 'admin'
   || $r === 'connecte'
   || ($r === 'pas-invite' && $role !== 'guest')
   || (is_array($r) && array_intersect($r, $perms));
if (!$ok) aller('dashboard.html');

// Servir la page : revérifiée à chaque visite (comme les autres .html, voir .htaccess), 304 si elle n'a pas changé
$mtime = filemtime($fichier);
$etag  = '"' . substr(md5($p . '|' . $mtime . '|' . filesize($fichier)), 0, 16) . '"';
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: private, no-cache');
header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $mtime) . ' GMT');
header('ETag: ' . $etag);
if (trim($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) { http_response_code(304); exit; }
header('Content-Length: ' . filesize($fichier));
readfile($fichier);
