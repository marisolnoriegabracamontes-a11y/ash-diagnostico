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

// Validar token de sesión
$token = sanitizar($input['token'] ?? '');

if (empty($token)) {
    echo json_encode([
        'success' => false,
        'message' => 'Token de sesión requerido.'
    ]);
    exit;
}

// Verificar sesión
$sessions = leerJSON(SESIONES_FILE);

if (!isset($sessions[$token])) {
    echo json_encode([
        'success' => false,
        'message' => 'Sesión no válida o expirada.'
    ]);
    exit;
}

$session = $sessions[$token];

// Verificar expiración
if (strtotime($session['expira_en']) < time()) {
    unset($sessions[$token]);
    guardarJSON(SESIONES_FILE, $sessions);
    
    echo json_encode([
        'success' => false,
        'message' => 'Sesión expirada. Por favor inicia nuevamente.'
    ]);
    exit;
}

// Obtener datos de la clave
$clavesData = leerJSON(CLAVES_FILE);
$claveIndex = $session['clave_index'] ?? null;
$claveId = $session['clave_id'] ?? null;

if ($claveIndex === null) {
    // Buscar por ID si no tenemos índice
    foreach ($clavesData['claves'] as $index => $claveDB) {
        if ($claveDB['id'] === $claveId) {
            $claveIndex = $index;
            break;
        }
    }
}

if ($claveIndex === null) {
    echo json_encode([
        'success' => false,
        'message' => 'Clave no encontrada en la base de datos.'
    ]);
    exit;
}

// Verificar que la clave no esté ya marcada como usada
if ($clavesData['claves'][$claveIndex]['usada']) {
    echo json_encode([
        'success' => false,
        'message' => 'Esta clave ya fue marcada como usada anteriormente.',
        'fecha_uso' => $clavesData['claves'][$claveIndex]['usada_en']
    ]);
    exit;
}

// Obtener datos del diagnóstico
$diagnosticoId = sanitizar($input['diagnostico_id'] ?? null);
$emailCliente = $session['email'] ?? '';
$producto = $session['producto'] ?? '';

// Marcar clave como usada
$clavesData['claves'][$claveIndex]['usada'] = true;
$clavesData['claves'][$claveIndex]['usada_en'] = date('Y-m-d H:i:s');
$clavesData['claves'][$claveIndex]['diagnostico_id'] = $diagnosticoId;

// Actualizar información adicional si se proporciona
if (isset($input['cliente_info'])) {
    $clienteInfo = sanitizar($input['cliente_info']);
    if (is_array($clienteInfo)) {
        if (isset($clienteInfo['nombre'])) {
            $clavesData['claves'][$claveIndex]['cliente_nombre'] = $clienteInfo['nombre'];
        }
        if (isset($clienteInfo['empresa'])) {
            $clavesData['claves'][$claveIndex]['cliente_empresa'] = $clienteInfo['empresa'];
        }
        if (isset($clienteInfo['cargo'])) {
            $clavesData['claves'][$claveIndex]['cliente_cargo'] = $clienteInfo['cargo'];
        }
    }
}

// Guardar cambios en claves
if (!guardarJSON(CLAVES_FILE, $clavesData)) {
    echo json_encode([
        'success' => false,
        'message' => 'Error al actualizar la base de datos de claves.'
    ]);
    exit;
}

// Eliminar sesión (ya no es necesaria)
unset($sessions[$token]);
guardarJSON(SESIONES_FILE, $sessions);

// Enviar correo de confirmación al consultor (TU EMAIL)
$claveInfo = $clavesData['claves'][$claveIndex];
$correoEnviado = enviarCorreoConfirmacion($claveInfo, $emailCliente, $producto);

// Registrar el evento
registrarLog("CLAVE_MARCADA_COMO_USADA", [
    'clave_id' => $claveId,
    'clave' => $claveInfo['clave'],
    'producto' => $producto,
    'email_cliente' => $emailCliente,
    'diagnostico_id' => $diagnosticoId,
    'correo_enviado' => $correoEnviado,
    'ip' => $session['ip']
]);

// Retornar éxito
echo json_encode([
    'success' => true,
    'message' => 'Clave marcada como usada exitosamente.',
    'clave' => [
        'id' => $claveId,
        'clave' => $claveInfo['clave'],
        'usada_en' => $claveInfo['usada_en'],
        'diagnostico_id' => $diagnosticoId
    ],
    'notificacion' => [
        'enviada' => $correoEnviado,
        'email_consultor' => TU_EMAIL
    ]
]);

/**
 * Enviar correo de confirmación al consultor
 */
function enviarCorreoConfirmacion($claveInfo, $emailCliente, $producto) {
    $asunto = "ASH - Clave utilizada: " . $claveInfo['clave'];
    
    $productoTexto = $producto === 'personas' ? 'Estabilidad Humana' : 'Estabilidad Estructural';
    $fecha = date('d/m/Y H:i');
    
    $html = '
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ASH - Clave Utilizada</title>
        <style>
            body { font-family: "Inter", Arial, sans-serif; line-height: 1.6; color: #1a1a1a; background: #f8f9fa; margin: 0; padding: 20px; }
            .email-container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.08); }
            .email-header { background: #1a1a1a; color: white; padding: 30px; text-align: center; }
            .email-logo { font-size: 28px; font-weight: 300; letter-spacing: 2px; margin-bottom: 10px; }
            .email-title { font-size: 20px; font-weight: 400; margin: 0; }
            .email-content { padding: 30px; }
            .info-card { background: #f8f9fa; border-radius: 12px; padding: 20px; margin: 20px 0; border-left: 4px solid #d4af37; }
            .info-item { margin-bottom: 15px; }
            .info-label { font-size: 14px; color: #6c757d; margin-bottom: 5px; }
            .info-value { font-size: 16px; font-weight: 500; color: #1a1a1a; }
            .email-footer { background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef; font-size: 12px; color: #6c757d; }
            .btn-action { display: inline-block; background: #1a1a1a; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 500; margin-top: 10px; }
        </style>
    </head>
    <body>
        <div class="email-container">
            <div class="email-header">
                <div class="email-logo">ASH</div>
                <h1 class="email-title">Clave de Acceso Utilizada</h1>
            </div>
            
            <div class="email-content">
                <p>Se ha utilizado una clave de acceso para el diagnóstico ASH.</p>
                
                <div class="info-card">
                    <div class="info-item">
                        <div class="info-label">Clave</div>
                        <div class="info-value">' . $claveInfo['clave'] . '</div>
                    </div>
                    
                    <div class="info-item">
                        <div class="info-label">Producto</div>
                        <div class="info-value">ASH ' . $productoTexto . '</div>
                    </div>
                    
                    <div class="info-item">
                        <div class="info-label">Cliente/Email</div>
                        <div class="info-value">' . htmlspecialchars($emailCliente) . '</div>
                    </div>
                    
                    <div class="info-item">
                        <div class="info-label">Fecha de Uso</div>
                        <div class="info-value">' . $fecha . '</div>
                    </div>
                    
                    <div class="info-item">
                        <div class="info-label">Generada Originalmente</div>
                        <div class="info-value">' . date('d/m/Y', strtotime($claveInfo['generada_en'])) . '</div>
                    </div>
                </div>
                
                <p>Los resultados del diagnóstico estarán disponibles en el panel de administración.</p>
                
                <a href="mailto:' . htmlspecialchars($emailCliente) . '" class="btn-action">
                    Contactar al cliente
                </a>
            </div>
            
            <div class="email-footer">
                <p>© ' . date('Y') . ' ASH Diagnóstico Ejecutivo. Sistema automático de notificaciones.</p>
            </div>
        </div>
    </body>
    </html>
    ';
    
    $headers = [
        'MIME-Version: 1.0',
        'Content-type: text/html; charset=utf-8',
        'From: ' . EMAIL_FROM_NAME . ' <' . EMAIL_FROM . '>',
        'Reply-To: ' . TU_EMAIL
    ];
    
    return mail(TU_EMAIL, $asunto, $html, implode("\r\n", $headers));
}
?>