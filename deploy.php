<?php
$secret = getenv('DEPLOY_SECRET');
$payload = file_get_contents('php://input');

if ($secret) {
    $sig = 'sha256=' . hash_hmac('sha256', $payload, $secret);
    if (!hash_equals($sig, $_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '')) {
        http_response_code(403);
        exit('Forbidden');
    }
}

$output = shell_exec('cd /home/u715089735/domains/fveilleux.com/public_html && git pull origin master 2>&1');
echo $output;
