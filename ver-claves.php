<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');

// Configuración
$clavesFile = 'claves.json';
$maxAttempts = 3;
$lockoutTime = 300; // 5 minutos en segundos

// Obtener datos del request
$data = json_decode(file_get_contents('php://input'), true);
$clave = trim($data['clave'] ?? '');
$producto = $data['producto'] ?? '';

// Validaciones básicas
if (empty($clave) || empty($producto)) {
    echo json_encode(['success' => false, 'message' => 'Datos incompletos']);
    exit;
}

// Cargar base de datos de claves
if (!file_exists($clavesFile)) {
    // Crear archivo si no existe
    file_put_contents($clavesFile, json_encode(['claves' => []], JSON_PRETTY_PRINT));
}

$database = json_decode(file_get_contents($clavesFile), true);

// Verificar control de intentos (IP-based)
$userIP = $_SERVER['REMOTE_ADDR'];
$attemptsFile = 'intentos.json';

if (file_exists($attemptsFile)) {
    $attempts = json_decode(file_get_contents($attemptsFile), true);
    
    if (isset($attempts[$userIP])) {
        if ($attempts[$userIP]['count'] >= $maxAttempts) {
            $timeSinceFirst = time() - $attempts[$userIP]['first_attempt'];
            
            if ($timeSinceFirst < $lockoutTime) {
                $remaining = $lockoutTime - $timeSinceFirst;
                echo json_encode([
                    'success' => false, 
                    'message' => 'Demasiados intentos. Espera ' . ceil($remaining/60) . ' minutos.'
                ]);
                exit;
            } else {
                // Resetear intentos después del tiempo de bloqueo
                unset($attempts[$userIP]);
            }
        }
    }
}

// Buscar la clave en la base de datos
$claveEncontrada = false;
$claveIndex = -1;

foreach ($database['claves'] as $index => $claveDB) {
    if ($claveDB['clave'] === $clave && $claveDB['producto'] === $producto) {
        $claveEncontrada = true;
        $claveIndex = $index;
        break;
    }
}

if (!$claveEncontrada) {
    // Registrar intento fallido
    if (!isset($attempts[$userIP])) {
        $attempts[$userIP] = ['count' => 1, 'first_attempt' => time()];
    } else {
        $attempts[$userIP]['count']++;
    }
    
    file_put_contents($attemptsFile, json_encode($attempts, JSON_PRETTY_PRINT));
    
    echo json_encode(['success' => false, 'message' => 'Clave no encontrada']);
    exit;
}

// Verificar si la clave ya fue usada
if ($database['claves'][$claveIndex]['usada'] === true) {
    echo json_encode([
        'success' => false, 
        'message' => 'Esta clave ya ha sido utilizada. Contacta a tu consultor.'
    ]);
    exit;
}

// Verificar vigencia
$now = time();
$expiracion = strtotime($database['claves'][$claveIndex]['valida_hasta']);

if ($now > $expiracion) {
    echo json_encode([
        'success' => false, 
        'message' => 'Clave expirada. Solicita una nueva a tu consultor.'
    ]);
    exit;
}

// TODO: Opcional - verificar límite de uso por IP o dispositivo
// (puedes implementar fingerprinting del navegador)

// Marcar clave como usada (pero no guardar todavía - se guarda al completar el diagnóstico)
// En su lugar, generamos un token de sesión
$sessionToken = bin2hex(random_bytes(16));
$sessionData = [
    'clave' => $clave,
    'producto' => $producto,
    'clave_index' => $claveIndex,
    'ip' => $userIP,
    'user_agent' => $_SERVER['HTTP_USER_AGENT'],
    'timestamp' => time(),
    'token' => $sessionToken
];

// Guardar sesión temporal (expira en 1 hora)
$sessionsFile = 'sesiones.json';
$sessions = file_exists($sessionsFile) ? json_decode(file_get_contents($sessionsFile), true) : [];
$sessions[$sessionToken] = $sessionData;

// Limpiar sesiones viejas
foreach ($sessions as $key => $session) {
    if (time() - $session['timestamp'] > 3600) {
        unset($sessions[$key]);
    }
}

file_put_contents($sessionsFile, json_encode($sessions, JSON_PRETTY_PRINT));

// Limpiar intentos exitosos
if (isset($attempts[$userIP])) {
    unset($attempts[$userIP]);
    file_put_contents($attemptsFile, json_encode($attempts, JSON_PRETTY_PRINT));
}

// Retornar éxito con token de sesión
echo json_encode([
    'success' => true,
    'token' => $sessionToken,
    'producto' => $producto,
    'valida_hasta' => $database['claves'][$claveIndex]['valida_hasta']
]);
?>