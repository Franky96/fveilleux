<?php
/*
 * Notifications de « vérification » du tableau de bord : administrateurs seulement (les invités et les autres comptes
 * ne les reçoivent pas, même en appelant ce script directement). Les notifications d'« événement » sont publiques,
 * dans evenements.json, et le tableau de bord les filtre selon les permissions.
 * Chaque vérification est calculée à partir des fichiers publiés par les pipelines :
 *   état « ok », « alerte » (à surveiller) ou « erreur ».
 */
define('_FVEILLEUX', 1);
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/session.php';

header('Cache-Control: no-store');
requireAdmin();

$racine = dirname(__DIR__);
$tz = new DateTimeZone('America/Toronto');
$auj = new DateTime('today', $tz);
$lire = function (string $f) use ($racine) { $p = "$racine/$f"; return is_file($p) ? (json_decode((string)file_get_contents($p), true) ?: null) : null; };
$quand = function (string $f) use ($racine) { $p = "$racine/$f"; return is_file($p) ? date(DATE_ATOM, filemtime($p)) : null; };
$jours = function (?string $date) use ($auj, $tz) { if (!$date) return 99; $d = DateTime::createFromFormat('!Y-m-d', $date, $tz); return $d ? (int)$d->diff($auj)->format('%r%a') : 99; };
$etat = fn(int $j) => $j <= 1 ? 'ok' : ($j <= 2 ? 'alerte' : 'erreur');
$v = [];

// 1. passage du pipeline « Votes Québec · données Qc125 » (aux 3 heures) : date inscrite dans votes-quebec/verif.json
$verif = $lire('votes-quebec/verif.json');
$j = $jours($verif['date'] ?? null);
$v[] = ['titre' => 'Votes Québec · pipeline aux 3 heures', 'etat' => $etat($j), 'quand' => $quand('votes-quebec/verif.json'),
        'sous' => $verif ? 'Dernier passage le ' . ($verif['texte'] ?? $verif['date']) : 'Fichier de vérification introuvable',
        'desc' => 'Sondages, projections, députés, gouvernements et simulation Loi 39 sont relus à chaque passage ; le pipeline inscrit la date de son dernier passage dans votes-quebec/verif.json.',
        'infos' => [['Workflow', 'Votes Québec · données Qc125'], ['Fichier', 'votes-quebec/verif.json']], 'page' => 'votes-quebec.html'];

// 2. Loi 39 : base de la simulation et projection Qc125
$res = $lire('votes-quebec/loi39-resume.json'); $maj = $lire('votes-quebec/outils/maj.json');
$v[] = ['titre' => 'Loi 39 · simulation', 'etat' => $res ? 'ok' : 'erreur', 'quand' => $quand('votes-quebec/loi39-resume.json'),
        'sous' => $res ? 'Base : ' . ($res['texte'] ?? '?') . ($maj ? ' · projection Qc125 du ' . ($maj['texte'] ?? $maj['date']) : '') : 'Résumé introuvable',
        'desc' => 'La simulation se rebâtit seulement quand la projection ou les résultats changent ; « Vérifié » donne la date de la dernière reconstruction.',
        'infos' => [['Sièges (loi 39)', $res ? implode(' · ', array_map(fn($p, $n) => "$p $n", array_keys($res['loi39'] ?? []), $res['loi39'] ?? [])) : '—']], 'page' => 'loi39.html'];

// 3. gouvernements actuels (fenêtre « Gouvernement actuel » de chaque endroit) : date de lecture de chaque source
$retard = []; $dernier = 0;
foreach (glob("$racine/votes-*/gouvernement.json") as $f) {
  $g = json_decode((string)file_get_contents($f), true) ?: [];
  if (!isset($g['date'])) continue;
  $dernier = max($dernier, filemtime($f));
  if ($jours($g['date']) > 1) $retard[] = basename(dirname($f)) . ' (' . $g['date'] . ')';
}
$v[] = ['titre' => 'Gouvernements actuels', 'etat' => $retard ? (count($retard) > 2 ? 'erreur' : 'alerte') : 'ok', 'quand' => $dernier ? date(DATE_ATOM, $dernier) : null,
        'sous' => $retard ? 'Source pas relue : ' . implode(', ', $retard) : 'Toutes les sources relues aujourd’hui ou hier',
        'desc' => 'Chaque endroit relit son conseil des ministres (outils/gouvernement.py) ; une source illisible garde l’ancien fichier.', 'infos' => []];

// 4. sondages de Votes Québec : le plus récent
$so = $lire('votes-quebec/sondages.json'); $l = $so['sondages'] ?? [];
if ($l) {
  usort($l, fn($a, $b) => strcmp($b['d'] ?? '', $a['d'] ?? ''));
  $v[] = ['titre' => 'Votes Québec · sondages', 'etat' => 'ok', 'quand' => $quand('votes-quebec/sondages.json'),
          'sous' => 'Dernier sondage : ' . ($l[0]['f'] ?? '?') . ', ' . ($l[0]['d'] ?? '?') . ' · ' . count($l) . ' sondages',
          'infos' => [['Source', $so['source'] ?? 'Qc125']], 'page' => 'votes-quebec.html'];
}

// 5. dernière mise en ligne du site : fichier le plus récent à la racine
$recent = 0;
foreach (glob("$racine/*.{html,js,css}", GLOB_BRACE) as $f) $recent = max($recent, filemtime($f));
$v[] = ['titre' => 'Site · dernière mise en ligne', 'etat' => 'ok', 'quand' => $recent ? date(DATE_ATOM, $recent) : null,
        'sous' => 'Fichier le plus récent servi par Hostinger',
        'desc' => 'Hostinger déploie master à chaque envoi ; deploy-hostinger.yml vérifie aux 30 minutes que le site sert les derniers fichiers.', 'infos' => [['Workflow', 'deploy-hostinger.yml']]];

jsonOut(['verifs' => $v]);
