<?php
require_once 'config.php';

// Configurar respuesta JSON
header('Content-Type: application/json; charset=utf-8');

// Permitir solo POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'message' => 'Método no permitido. Use POST.'
    ]);
    exit;
}

// Obtener y validar datos
$input = json_decode(file_get_contents('php://input'), true);

if (!$input) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Datos JSON inválidos o vacíos.'
    ]);
    exit;
}

// Sanitizar datos
$clave = sanitizar($input['clave'] ?? '');
$producto = sanitizar($input['producto'] ?? '');
$email = sanitizar($input['email'] ?? '');

// Validaciones básicas
if (empty($clave) || empty($producto)) {
    echo json_encode([
        'success' => false,
        'message' => 'Clave y producto son requeridos.'
    ]);
    exit;
}

if ($producto !== 'personas' && $producto !== 'empresas') {
    echo json_encode([
        'success' => false,
        'message' => 'Producto inválido. Use "personas" o "empresas".'
    ]);
    exit;
}

// Validar formato de clave
if (!validarFormatoClave($clave, $producto)) {
    echo json_encode([
        'success' => false,
        'message' => 'Formato de clave inválido para ' . $producto . '.'
    ]);
    exit;
}

// Control de intentos por IP
$ip = $_SERVER['REMOTE_ADDR'];
$userAgent = $_SERVER['HTTP_USER_AGENT'] ?? 'Desconocido';
$fingerprint = hash('sha256', $ip . $userAgent . $clave);

$intentos = leerJSON(INTENTOS_FILE);

// Verificar si está bloqueado
if (isset($intentos[$fingerprint])) {
    $intento = $intentos[$fingerprint];
    
    if ($intento['bloqueado_hasta'] > time()) {
        $tiempoRestante = $intento['bloqueado_hasta'] - time();
        $minutos = ceil($tiempoRestante / 60);
        
        echo json_encode([
            'success' => false,
            'message' => "Demasiados intentos fallidos. Intenta nuevamente en $minutos minutos.",
            'bloqueado' => true,
            'minutos_restantes' => $minutos
        ]);
        exit;
    }
    
    // Limpiar intentos viejos (más de 1 hora)
    if (time() - $intento['primer_intento'] > 3600) {
        unset($intentos[$fingerprint]);
    }
}

// Buscar clave en la base de datos
$clavesData = leerJSON(CLAVES_FILE);
$claveEncontrada = null;
$claveIndex = null;

foreach ($clavesData['claves'] as $index => $claveDB) {
    if ($claveDB['clave'] === $clave && $claveDB['producto'] === $producto) {
        $claveEncontrada = $claveDB;
        $claveIndex = $index;
        break;
    }
}

// Si no se encuentra la clave
if (!$claveEncontrada) {
    registrarIntentoFallido($fingerprint, $clave, $producto, false);
    
    echo json_encode([
        'success' => false,
        'message' => 'Clave no registrada en el sistema.'
    ]);
    exit;
}

// Verificar si ya fue usada
if ($claveEncontrada['usada']) {
    echo json_encode([
        'success' => false,
        'message' => 'Esta clave ya ha sido utilizada.'
    ]);
    exit;
}

// Verificar vigencia
$expiracion = strtotime($claveEncontrada['valida_hasta']);
$ahora = time();

if ($ahora > $expiracion) {
    echo json_encode([
        'success' => false,
        'message' => 'Clave expirada. Contacta a tu consultor para una nueva.'
    ]);
    exit;
}

// Verificar límite de intentos para esta clave
if ($claveEncontrada['intentos'] >= 5) {
    echo json_encode([
        'success' => false,
        'message' => 'Límite de intentos excedido para esta clave.'
    ]);
    exit;
}

// Incrementar contador de intentos para esta clave
$clavesData['claves'][$claveIndex]['intentos']++;
$clavesData['claves'][$claveIndex]['ultimo_intento'] = date('Y-m-d H:i:s');

// Crear sesión temporal
$sessionToken = generarToken(32);
$sessionData = [
    'token' => $sessionToken,
    'clave' => $clave,
    'producto' => $producto,
    'email' => $email,
    'clave_id' => $claveEncontrada['id'],
    'clave_index' => $claveIndex,
    'ip' => $ip,
    'user_agent' => $userAgent,
    'creada_en' => date('Y-m-d H:i:s'),
    'expira_en' => date('Y-m-d H:i:s', strtotime('+1 hour'))
];

// Guardar sesión
$sessions = leerJSON(SESIONES_FILE);
$sessions[$sessionToken] = $sessionData;

// Limpiar sesiones expiradas
foreach ($sessions as $key => $session) {
    if (strtotime($session['expira_en']) < $ahora) {
        unset($sessions[$key]);
    }
}

// Guardar todos los cambios
guardarJSON(SESIONES_FILE, $sessions);
guardarJSON(CLAVES_FILE, $clavesData);

// Limpiar intentos fallidos previos para este fingerprint
if (isset($intentos[$fingerprint])) {
    unset($intentos[$fingerprint]);
    guardarJSON(INTENTOS_FILE, $intentos);
}

// Registrar éxito
registrarLog("CLAVE_VERIFICADA_EXITOSA", [
    'clave' => $clave,
    'producto' => $producto,
    'email' => $email,
    'ip' => $ip,
    'sesion' => $sessionToken
]);

// Retornar éxito
echo json_encode([
    'success' => true,
    'message' => 'Clave verificada exitosamente.',
    'token' => $sessionToken,
    'producto' => $producto,
    'expiracion' => $claveEncontrada['valida_hasta'],
    'valida_hasta' => $claveEncontrada['valida_hasta'],
    'sesion' => [
        'expira_en' => $sessionData['expira_en']
    ]
]);

/**
 * Registrar intento fallido
 */
function registrarIntentoFallido($fingerprint, $clave, $producto, $claveExiste = true) {
    $intentos = leerJSON(INTENTOS_FILE);
    
    if (!isset($intentos[$fingerprint])) {
        $intentos[$fingerprint] = [
            'intentos' => 1,
            'primer_intento' => time(),
            'ultimo_intento' => time(),
            'clave' => $clave,
            'producto' => $producto,
            'clave_existe' => $claveExiste,
            'bloqueado_hasta' => 0
        ];
    } else {
        $intentos[$fingerprint]['intentos']++;
        $intentos[$fingerprint]['ultimo_intento'] = time();
        $intentos[$fingerprint]['clave'] = $clave;
        $intentos[$fingerprint]['producto'] = $producto;
        $intentos[$fingerprint]['clave_existe'] = $claveExiste;
        
        // Bloquear después de MAX_INTENTOS_FALLIDOS
        if ($intentos[$fingerprint]['intentos'] >= MAX_INTENTOS_FALLIDOS) {
            $intentos[$fingerprint]['bloqueado_hasta'] = time() + (TIEMPO_BLOQUEO_MINUTOS * 60);
        }
    }
    
    guardarJSON(INTENTOS_FILE, $intentos);
    
    registrarLog("INTENTO_FALLIDO", [
        'fingerprint' => $fingerprint,
        'clave' => $clave,
        'producto' => $producto,
        'clave_existe' => $claveExiste,
        'ip' => $_SERVER['REMOTE_ADDR']
    ], 'WARNING');
}
?>