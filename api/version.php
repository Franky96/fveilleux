<?php
/*
 * Empreinte du déploiement : change dès qu'un fichier .html, .js ou .css du site est modifié par un push sur master.
 * version.js l'interroge régulièrement : si elle a changé depuis l'ouverture de la page, la page se recharge
 * (onglets restés ouverts, pages restaurées depuis le cache du téléphone, etc.).
 * Ne révèle rien d'autre qu'un code opaque ; les .json (données régénérées par le pipeline) sont ignorés.
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$cache = sys_get_temp_dir() . '/fv_version.json';
if (is_file($cache) && time() - filemtime($cache) < 15) { readfile($cache); exit; }

$racine = dirname(__DIR__);
$max = 0; $n = 0;
$it = new RecursiveIteratorIterator(new RecursiveCallbackFilterIterator(
  new RecursiveDirectoryIterator($racine, FilesystemIterator::SKIP_DOTS),
  fn($f) => !($f->isDir() && in_array($f->getFilename(), ['.git', '.github', 'node_modules', 'api', 'outils'], true))
));
foreach ($it as $f) {
  if (!preg_match('/\.(html?|m?js|css)$/i', $f->getFilename())) continue;
  $n++; $max = max($max, $f->getMTime());
}
$json = json_encode(['v' => substr(md5($max . '-' . $n), 0, 12)]);
@file_put_contents($cache, $json, LOCK_EX);
echo $json;
