<?php
// ============================================
// CONFIGURACIÓN DEL SISTEMA ASH
// ============================================

// Configuración de seguridad
define('SISTEMA_NOMBRE', 'ASH Diagnóstico Ejecutivo');
define('SISTEMA_VERSION', '2.0.0');
define('SISTEMA_AUTOR', 'IEE - Intervención Ejecutiva Estratégica');

// TU EMAIL CONFIGURADO
define('TU_EMAIL', 'marisol.noriega.bracamontes@gmail.com');
define('EMAIL_FROM', 'sistema@iee.mx');
define('EMAIL_FROM_NAME', 'ASH Sistema de Diagnóstico');

// Configuración de claves
define('CLAVE_PREFIJO_PERSONAS', 'ASH-P-');
define('CLAVE_PREFIJO_EMPRESAS', 'ASH-E-');
define('CLAVE_LONGITUD', 12); // Sin contar prefijo
define('CLAVE_VIGENCIA_DIAS', 7);

// Configuración de seguridad
define('MAX_INTENTOS_FALLIDOS', 3);
define('TIEMPO_BLOQUEO_MINUTOS', 15);
define('SESSION_TIMEOUT_MINUTOS', 60);

// Configuración de archivos
define('BASE_DIR', __DIR__ . '/../');
define('DATA_DIR', BASE_DIR . 'data/');
define('CLAVES_FILE', DATA_DIR . 'claves.json');
define('DIAGNOSTICOS_FILE', DATA_DIR . 'diagnosticos.json');
define('SESIONES_FILE', DATA_DIR . 'sesiones.json');
define('INTENTOS_FILE', DATA_DIR . 'intentos.json');
define('LOG_FILE', DATA_DIR . 'logs/ash_' . date('Y-m-d') . '.log');

// Configuración del servidor
$config = [
    'entorno' => 'produccion', // desarrollo, testing, produccion
    'base_url' => (isset($_SERVER['HTTPS']) ? 'https://' : 'http://') . $_SERVER['HTTP_HOST'] . dirname($_SERVER['PHP_SELF']) . '/',
    'debug' => false
];

// ============================================
// FUNCIONES DE SEGURIDAD
// ============================================

/**
 * Validar origen de la petición (CORS)
 */
function validarOrigen() {
    if (isset($_SERVER['HTTP_ORIGIN'])) {
        $allowedOrigins = [
            'http://localhost',
            'https://localhost',
            'https://tu-dominio.com',
            'https://iee.mx'
        ];
        
        foreach ($allowedOrigins as $origin) {
            if (strpos($_SERVER['HTTP_ORIGIN'], $origin) !== false) {
                header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
                break;
            }
        }
    }
    
    header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type, Authorization");
    header("Access-Control-Allow-Credentials: true");
    header("Access-Control-Max-Age: 86400");
}

/**
 * Sanitizar entrada de datos
 */
function sanitizar($input) {
    if (is_array($input)) {
        return array_map('sanitizar', $input);
    }
    
    $input = trim($input);
    $input = stripslashes($input);
    $input = htmlspecialchars($input, ENT_QUOTES, 'UTF-8');
    
    return $input;
}

/**
 * Validar email
 */
function validarEmail($email) {
    return filter_var($email, FILTER_VALIDATE_EMAIL);
}

/**
 * Generar token seguro
 */
function generarToken($longitud = 32) {
    return bin2hex(random_bytes($longitud));
}

/**
 * Validar formato de clave
 */
function validarFormatoClave($clave, $producto) {
    $prefijo = $producto === 'personas' ? CLAVE_PREFIJO_PERSONAS : CLAVE_PREFIJO_EMPRESAS;
    
    // Verificar prefijo
    if (strpos($clave, $prefijo) !== 0) {
        return false;
    }
    
    // Verificar longitud total (prefijo + guion + 12 caracteres)
    if (strlen($clave) !== strlen($prefijo) + 13) { // ASH-P-XXXX-XXXX-XXXX
        return false;
    }
    
    // Verificar formato con guiones
    if (!preg_match('/^[A-Z]{3}-[A-Z]-\d{4}-\d{4}-\d{4}$/', $clave)) {
        return false;
    }
    
    return true;
}

// ============================================
// FUNCIONES DE ARCHIVOS JSON
// ============================================

/**
 * Inicializar directorio de datos
 */
function inicializarDirectorioDatos() {
    if (!file_exists(DATA_DIR)) {
        mkdir(DATA_DIR, 0755, true);
        
        // Crear subdirectorio para logs
        if (!file_exists(DATA_DIR . 'logs/')) {
            mkdir(DATA_DIR . 'logs/', 0755, true);
        }
        
        // Crear archivos iniciales
        $archivosIniciales = [
            CLAVES_FILE => ['claves' => [], 'contador' => 0],
            DIAGNOSTICOS_FILE => ['diagnosticos' => [], 'contador' => 0],
            SESIONES_FILE => [],
            INTENTOS_FILE => []
        ];
        
        foreach ($archivosIniciales as $archivo => $contenido) {
            if (!file_exists($archivo)) {
                file_put_contents($archivo, json_encode($contenido, JSON_PRETTY_PRINT));
            }
        }
        
        // Archivo de protección
        file_put_contents(DATA_DIR . '.htaccess', "Deny from all\n");
        file_put_contents(DATA_DIR . 'index.html', '<!DOCTYPE html><html><head><title>403 Forbidden</title></head><body><h1>Access Forbidden</h1></body></html>');
    }
}

/**
 * Leer archivo JSON
 */
function leerJSON($archivo, $default = []) {
    if (!file_exists($archivo)) {
        return $default;
    }
    
    $contenido = file_get_contents($archivo);
    $data = json_decode($contenido, true);
    
    if (json_last_error() !== JSON_ERROR_NONE) {
        registrarLog("ERROR_JSON", [
            'archivo' => basename($archivo),
            'error' => json_last_error_msg()
        ]);
        return $default;
    }
    
    return $data ?: $default;
}

/**
 * Guardar archivo JSON de forma segura
 */
function guardarJSON($archivo, $data) {
    // Crear archivo temporal
    $tempFile = $archivo . '.tmp.' . uniqid();
    
    // Guardar en temporal
    if (file_put_contents($tempFile, json_encode($data, JSON_PRETTY_PRINT))) {
        // Renombrar a archivo final (operación atómica)
        if (rename($tempFile, $archivo)) {
            chmod($archivo, 0644);
            return true;
        } else {
            // Limpiar archivo temporal si falla
            @unlink($tempFile);
        }
    }
    
    registrarLog("ERROR_GUARDAR_JSON", [
        'archivo' => basename($archivo),
        'error' => 'No se pudo guardar el archivo'
    ]);
    
    return false;
}

// ============================================
// FUNCIONES DE CLAVES
// ============================================

/**
 * Generar nueva clave única
 */
function generarClave($producto, $cliente = '', $proyecto = '') {
    $prefijo = $producto === 'personas' ? CLAVE_PREFIJO_PERSONAS : CLAVE_PREFIJO_EMPRESAS;
    
    // Generar partes aleatorias
    $parte1 = strtoupper(bin2hex(random_bytes(2))); // 4 caracteres
    $parte2 = str_pad(rand(0, 9999), 4, '0', STR_PAD_LEFT); // 4 dígitos
    $parte3 = str_pad(rand(0, 9999), 4, '0', STR_PAD_LEFT); // 4 dígitos
    
    $clave = $prefijo . $parte1 . '-' . $parte2 . '-' . $parte3;
    
    // Leer base de datos de claves
    $clavesData = leerJSON(CLAVES_FILE);
    
    // Verificar que no exista (aunque es muy improbable)
    foreach ($clavesData['claves'] as $claveExistente) {
        if ($claveExistente['clave'] === $clave) {
            // Si existe, generar otra
            return generarClave($producto, $cliente, $proyecto);
        }
    }
    
    return $clave;
}

/**
 * Crear entrada de clave en la base de datos
 */
function crearEntradaClave($clave, $producto, $cliente = '', $proyecto = '') {
    $clavesData = leerJSON(CLAVES_FILE);
    
    $nuevaClave = [
        'id' => ++$clavesData['contador'],
        'clave' => $clave,
        'producto' => $producto,
        'generada_en' => date('Y-m-d H:i:s'),
        'valida_hasta' => date('Y-m-d H:i:s', strtotime('+' . CLAVE_VIGENCIA_DIAS . ' days')),
        'usada' => false,
        'usada_en' => null,
        'cliente' => sanitizar($cliente),
        'proyecto' => sanitizar($proyecto),
        'generada_por' => 'sistema',
        'intentos' => 0,
        'ultimo_intento' => null,
        'diagnostico_id' => null
    ];
    
    $clavesData['claves'][] = $nuevaClave;
    
    if (guardarJSON(CLAVES_FILE, $clavesData)) {
        registrarLog("CLAVE_GENERADA", [
            'clave' => $clave,
            'producto' => $producto,
            'cliente' => $cliente
        ]);
        return $nuevaClave;
    }
    
    return false;
}

// ============================================
// FUNCIONES DE LOGGING
// ============================================

/**
 * Registrar evento en log
 */
function registrarLog($evento, $datos = [], $nivel = 'INFO') {
    $logFile = DATA_DIR . 'logs/ash_' . date('Y-m-d') . '.log';
    
    if (!file_exists(dirname($logFile))) {
        mkdir(dirname($logFile), 0755, true);
    }
    
    $logEntry = sprintf(
        "[%s] %s: %s %s\n",
        date('Y-m-d H:i:s'),
        $nivel,
        $evento,
        !empty($datos) ? json_encode($datos, JSON_UNESCAPED_UNICODE) : ''
    );
    
    file_put_contents($logFile, $logEntry, FILE_APPEND | LOCK_EX);
}

// ============================================
// FUNCIONES DE CORREO
// ============================================

/**
 * Enviar correo con resultados
 */
function enviarCorreoResultados($para, $datosDiagnostico) {
    $asunto = "ASH Diagnóstico - Resultados " . 
              ($datosDiagnostico['producto'] === 'personas' ? 'de Estabilidad Humana' : 'de Estabilidad Estructural');
    
    // Preparar datos para el correo
    $productoTexto = $datosDiagnostico['producto'] === 'personas' ? 'Estabilidad Humana' : 'Estabilidad Estructural';
    $fecha = date('d/m/Y H:i');
    
    // Construir HTML del correo
    $html = '
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ASH Diagnóstico - Resultados</title>
        <style>
            body {
                font-family: "Inter", Arial, sans-serif;
                line-height: 1.6;
                color: #1a1a1a;
                background: #f8f9fa;
                margin: 0;
                padding: 20px;
            }
            
            .email-container {
                max-width: 600px;
                margin: 0 auto;
                background: white;
                border-radius: 16px;
                overflow: hidden;
                box-shadow: 0 8px 24px rgba(0,0,0,0.08);
            }
            
            .email-header {
                background: #1a1a1a;
                color: white;
                padding: 40px 30px;
                text-align: center;
            }
            
            .email-logo {
                font-size: 32px;
                font-weight: 300;
                letter-spacing: 2px;
                margin-bottom: 10px;
            }
            
            .email-title {
                font-size: 24px;
                font-weight: 400;
                margin: 0;
            }
            
            .email-subtitle {
                color: rgba(255,255,255,0.8);
                font-size: 14px;
                margin-top: 10px;
            }
            
            .email-content {
                padding: 40px 30px;
            }
            
            .results-summary {
                background: #f8f9fa;
                border-radius: 12px;
                padding: 25px;
                margin-bottom: 30px;
                border-left: 4px solid #d4af37;
            }
            
            .result-item {
                margin-bottom: 15px;
            }
            
            .result-label {
                font-size: 14px;
                color: #6c757d;
                margin-bottom: 5px;
            }
            
            .result-value {
                font-size: 18px;
                font-weight: 500;
                color: #1a1a1a;
            }
            
            .status-badge {
                display: inline-block;
                padding: 6px 12px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 500;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .status-critical {
                background: #fee2e2;
                color: #991b1b;
            }
            
            .status-alert {
                background: #fef3c7;
                color: #92400e;
            }
            
            .status-stable {
                background: #d1fae5;
                color: #065f46;
            }
            
            .email-footer {
                background: #f8f9fa;
                padding: 30px;
                text-align: center;
                border-top: 1px solid #e9ecef;
                font-size: 12px;
                color: #6c757d;
            }
            
            .btn-ash {
                display: inline-block;
                background: #1a1a1a;
                color: white;
                padding: 12px 24px;
                border-radius: 8px;
                text-decoration: none;
                font-weight: 500;
                margin-top: 20px;
                transition: all 0.3s ease;
            }
            
            .btn-ash:hover {
                background: #333333;
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }
        </style>
    </head>
    <body>
        <div class="email-container">
            <div class="email-header">
                <div class="email-logo">ASH</div>
                <h1 class="email-title">Snapshot Ejecutivo</h1>
                <p class="email-subtitle">' . $productoTexto . ' - ' . $fecha . '</p>
            </div>
            
            <div class="email-content">
                <p>Hola,</p>
                
                <p>Se ha completado exitosamente el diagnóstico de <strong>' . $productoTexto . '</strong>.</p>
                
                <div class="results-summary">
                    <div class="result-item">
                        <div class="result-label">Promedio Global</div>
                        <div class="result-value">' . ($datosDiagnostico['promedio_global'] ?? 'N/A') . '/5.0</div>
                    </div>
                    
                    <div class="result-item">
                        <div class="result-label">Estado del Sistema</div>
                        <div class="result-value">
                            ' . ($datosDiagnostico['estado_sistema'] ?? 'N/A') . '
                        </div>
                    </div>
                    
                    <div class="result-item">
                        <div class="result-label">Prioridad de Intervención</div>
                        <div class="result-value">
                            ' . ($datosDiagnostico['prioridad'] ?? 'N/A') . '
                        </div>
                    </div>
                </div>
                
                <p>Los resultados completos, incluyendo análisis detallado por dimensión y recomendaciones específicas, están disponibles en tu panel de administración.</p>
                
                <p><strong>IEE - Intervención Ejecutiva Estratégica</strong></p>
                
                <a href="mailto:' . TU_EMAIL . '" class="btn-ash">
                    Solicitar análisis personalizado
                </a>
            </div>
            
            <div class="email-footer">
                <p>© ' . date('Y') . ' ASH Diagnóstico Ejecutivo. Sistema propietario IEE.</p>
                <p>Este es un correo automático del sistema ASH. Por favor no responder a este mensaje.</p>
            </div>
        </div>
    </body>
    </html>
    ';
    
    // Configurar cabeceras
    $headers = [
        'MIME-Version: 1.0',
        'Content-type: text/html; charset=utf-8',
        'From: ' . EMAIL_FROM_NAME . ' <' . EMAIL_FROM . '>',
        'Reply-To: ' . TU_EMAIL,
        'X-Mailer: PHP/' . phpversion(),
        'X-Priority: 1',
        'Importance: High'
    ];
    
    // Intentar enviar correo
    if (mail($para, $asunto, $html, implode("\r\n", $headers))) {
        registrarLog("CORREO_ENVIADO", [
            'para' => $para,
            'producto' => $datosDiagnostico['producto'],
            'estado' => $datosDiagnostico['estado_sistema'] ?? 'N/A'
        ]);
        return true;
    } else {
        registrarLog("ERROR_CORREO", [
            'para' => $para,
            'error' => 'Fallo en función mail()'
        ], 'ERROR');
        return false;
    }
}

// ============================================
// INICIALIZACIÓN DEL SISTEMA
// ============================================

// Validar origen (CORS)
validarOrigen();

// Inicializar directorio de datos
inicializarDirectorioDatos();

// Configurar zona horaria
date_default_timezone_set('America/Mexico_City');

// Configurar manejo de errores según entorno
if ($config['entorno'] === 'desarrollo' || $config['debug']) {
    error_reporting(E_ALL);
    ini_set('display_errors', 1);
} else {
    error_reporting(0);
    ini_set('display_errors', 0);
}

// Registrar inicio de solicitud
if ($config['debug']) {
    registrarLog("SOLICITUD_INICIADA", [
        'metodo' => $_SERVER['REQUEST_METHOD'],
        'uri' => $_SERVER['REQUEST_URI'] ?? '',
        'ip' => $_SERVER['REMOTE_ADDR'] ?? ''
    ]);
}
?>