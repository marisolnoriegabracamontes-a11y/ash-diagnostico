<?php
require_once '../includes/config.php';

// Verificar acceso (en producción, agregar autenticación real)
session_start();
if (!isset($_SESSION['admin_logged_in']) || $_SESSION['admin_logged_in'] !== true) {
    header('Location: login.php');
    exit;
}

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Método no permitido']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);

$cantidad = intval($input['cantidad'] ?? 1);
$producto = $input['producto'] ?? 'personas';
$validezDias = intval($input['dias'] ?? CLAVE_VIGENCIA_DIAS);
$cliente = sanitizar($input['cliente'] ?? '');
$proyecto = sanitizar($input['proyecto'] ?? '');

if ($cantidad < 1 || $cantidad > 50) {
    echo json_encode(['error' => 'Cantidad debe estar entre 1 y 50']);
    exit;
}

if (!in_array($producto, ['personas', 'empresas'])) {
    echo json_encode(['error' => 'Producto inválido']);
    exit;
}

$clavesGeneradas = [];
$claves = leerJSON(CLAVES_FILE);

for ($i = 0; $i < $cantidad; $i++) {
    $clave = generarClave($producto);
    
    $nuevaClave = [
        'clave' => $clave,
        'producto' => $producto,
        'generada_en' => date('Y-m-d H:i:s'),
        'valida_hasta' => date('Y-m-d H:i:s', strtotime("+$validezDias days")),
        'usada' => false,
        'usada_en' => null,
        'cliente' => $cliente,
        'proyecto' => $proyecto,
        'generada_por' => $_SESSION['admin_usuario'] ?? 'sistema',
        'intentos' => 0,
        'ultimo_intento' => null
    ];
    
    $claves['claves'][] = $nuevaClave;
    $clavesGeneradas[] = $nuevaClave;
}

guardarJSON(CLAVES_FILE, $claves);

// Registrar en log
registrarLog('CLAVES_GENERADAS', [
    'cantidad' => $cantidad,
    'producto' => $producto,
    'cliente' => $cliente,
    'generadas_por' => $_SESSION['admin_usuario'] ?? 'sistema'
]);

echo json_encode([
    'success' => true,
    'claves' => $clavesGeneradas,
    'total' => count($claves['claves'])
]);
?>