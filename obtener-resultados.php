<?php
require_once 'config.php';

// Configurar respuesta JSON
header('Content-Type: application/json; charset=utf-8');

// Validar método (GET para consultas, POST para búsquedas específicas)
$metodo = $_SERVER['REQUEST_METHOD'];

if ($metodo !== 'GET' && $metodo !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'message' => 'Método no permitido. Use GET o POST.'
    ]);
    exit;
}

// Para GET: parámetros por query string
if ($metodo === 'GET') {
    $tipo = $_GET['tipo'] ?? 'recientes';
    $limite = isset($_GET['limite']) ? intval($_GET['limite']) : 10;
    $pagina = isset($_GET['pagina']) ? intval($_GET['pagina']) : 1;
    $producto = $_GET['producto'] ?? 'todos';
    $desde = $_GET['desde'] ?? '';
    $hasta = $_GET['hasta'] ?? '';
    $id = $_GET['id'] ?? '';
    
    // Validar límites
    $limite = min(max($limite, 1), 100); // Entre 1 y 100
    $pagina = max($pagina, 1);
    $offset = ($pagina - 1) * $limite;
}

// Para POST: datos por JSON
if ($metodo === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!$input) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'message' => 'Datos JSON inválidos o vacíos.'
        ]);
        exit;
    }
    
    $tipo = $input['tipo'] ?? 'recientes';
    $limite = isset($input['limite']) ? intval($input['limite']) : 10;
    $pagina = isset($input['pagina']) ? intval($input['pagina']) : 1;
    $producto = $input['producto'] ?? 'todos';
    $desde = $input['desde'] ?? '';
    $hasta = $input['hasta'] ?? '';
    $id = $input['id'] ?? '';
    $clave = $input['clave'] ?? '';
    $email = $input['email'] ?? '';
    
    // Validar límites
    $limite = min(max($limite, 1), 100);
    $pagina = max($pagina, 1);
    $offset = ($pagina - 1) * $limite;
}

// Cargar todos los diagnósticos
$diagnosticosData = leerJSON(DIAGNOSTICOS_FILE);
$diagnosticos = $diagnosticosData['diagnosticos'] ?? [];
$totalDiagnosticos = count($diagnosticos);

// Filtrar según parámetros
$diagnosticosFiltrados = $diagnosticos;

// Filtrar por ID específico
if (!empty($id)) {
    $diagnosticosFiltrados = array_filter($diagnosticosFiltrados, function($d) use ($id) {
        return $d['id'] === $id || (isset($d['id_num']) && $d['id_num'] == $id);
    });
    $diagnosticosFiltrados = array_values($diagnosticosFiltrados);
}

// Filtrar por producto
if ($producto !== 'todos') {
    $diagnosticosFiltrados = array_filter($diagnosticosFiltrados, function($d) use ($producto) {
        return $d['producto'] === $producto;
    });
    $diagnosticosFiltrados = array_values($diagnosticosFiltrados);
}

// Filtrar por clave
if (!empty($clave)) {
    // Buscar diagnósticos asociados a esta clave
    $clavesData = leerJSON(CLAVES_FILE);
    $claveInfo = null;
    
    foreach ($clavesData['claves'] as $claveDB) {
        if ($claveDB['clave'] === $clave) {
            $claveInfo = $claveDB;
            break;
        }
    }
    
    if ($claveInfo && isset($claveInfo['diagnostico_id'])) {
        $diagnosticosFiltrados = array_filter($diagnosticosFiltrados, function($d) use ($claveInfo) {
            return $d['id'] === $claveInfo['diagnostico_id'];
        });
        $diagnosticosFiltrados = array_values($diagnosticosFiltrados);
    } else {
        $diagnosticosFiltrados = [];
    }
}

// Filtrar por email
if (!empty($email)) {
    $diagnosticosFiltrados = array_filter($diagnosticosFiltrados, function($d) use ($email) {
        return stripos($d['email_cliente'] ?? '', $email) !== false;
    });
    $diagnosticosFiltrados = array_values($diagnosticosFiltrados);
}

// Filtrar por fecha
if (!empty($desde) && !empty($hasta)) {
    $desdeTs = strtotime($desde);
    $hastaTs = strtotime($hasta . ' 23:59:59');
    
    if ($desdeTs && $hastaTs) {
        $diagnosticosFiltrados = array_filter($diagnosticosFiltrados, function($d) use ($desdeTs, $hastaTs) {
            $fechaTs = strtotime($d['fecha']);
            return $fechaTs >= $desdeTs && $fechaTs <= $hastaTs;
        });
        $diagnosticosFiltrados = array_values($diagnosticosFiltrados);
    }
} elseif (!empty($desde)) {
    $desdeTs = strtotime($desde);
    if ($desdeTs) {
        $diagnosticosFiltrados = array_filter($diagnosticosFiltrados, function($d) use ($desdeTs) {
            $fechaTs = strtotime($d['fecha']);
            return $fechaTs >= $desdeTs;
        });
        $diagnosticosFiltrados = array_values($diagnosticosFiltrados);
    }
} elseif (!empty($hasta)) {
    $hastaTs = strtotime($hasta . ' 23:59:59');
    if ($hastaTs) {
        $diagnosticosFiltrados = array_filter($diagnosticosFiltrados, function($d) use ($hastaTs) {
            $fechaTs = strtotime($d['fecha']);
            return $fechaTs <= $hastaTs;
        });
        $diagnosticosFiltrados = array_values($diagnosticosFiltrados);
    }
}

// Ordenar según tipo
switch ($tipo) {
    case 'recientes':
        usort($diagnosticosFiltrados, function($a, $b) {
            return strtotime($b['fecha']) - strtotime($a['fecha']);
        });
        break;
        
    case 'antiguos':
        usort($diagnosticosFiltrados, function($a, $b) {
            return strtotime($a['fecha']) - strtotime($b['fecha']);
        });
        break;
        
    case 'criticos':
        usort($diagnosticosFiltrados, function($a, $b) {
            $aPrio = $a['estado_sistema'] === 'CRÍTICO' ? 3 : 
                    ($a['estado_sistema'] === 'ALERTA' ? 2 : 
                    ($a['estado_sistema'] === 'ESTABLE' ? 1 : 0));
            $bPrio = $b['estado_sistema'] === 'CRÍTICO' ? 3 : 
                    ($b['estado_sistema'] === 'ALERTA' ? 2 : 
                    ($b['estado_sistema'] === 'ESTABLE' ? 1 : 0));
            return $bPrio - $aPrio;
        });
        break;
        
    case 'puntuacion_alta':
        usort($diagnosticosFiltrados, function($a, $b) {
            return ($b['promedio_global'] ?? 0) - ($a['promedio_global'] ?? 0);
        });
        break;
        
    case 'puntuacion_baja':
        usort($diagnosticosFiltrados, function($a, $b) {
            return ($a['promedio_global'] ?? 0) - ($b['promedio_global'] ?? 0);
        });
        break;
}

// Aplicar paginación
$totalFiltrados = count($diagnosticosFiltrados);
$diagnosticosPaginados = array_slice($diagnosticosFiltrados, $offset, $limite);

// Calcular estadísticas
$estadisticas = calcularEstadisticas($diagnosticosFiltrados);

// Preparar respuesta simplificada (sin respuestas individuales por defecto)
$respuestaDiagnosticos = array_map(function($diagnostico) {
    // Datos básicos
    $resumen = [
        'id' => $diagnostico['id'],
        'id_num' => $diagnostico['id_num'] ?? null,
        'fecha' => $diagnostico['fecha'],
        'producto' => $diagnostico['producto'],
        'email_cliente' => $diagnostico['email_cliente'],
        'promedio_global' => $diagnostico['promedio_global'],
        'estado_sistema' => $diagnostico['estado_sistema'],
        'prioridad' => $diagnostico['prioridad'],
        'hallazgos_count' => count($diagnostico['hallazgos'] ?? []),
        'recomendaciones_count' => count($diagnostico['recomendaciones'] ?? [])
    ];
    
    // Incluir puntuaciones si se solicita detalle
    if (isset($_GET['detalle']) && $_GET['detalle'] === 'completo') {
        $resumen['puntuaciones'] = $diagnostico['puntuaciones'];
        $resumen['hallazgos'] = $diagnostico['hallazgos'];
        $resumen['recomendaciones'] = $diagnostico['recomendaciones'];
    }
    
    return $resumen;
}, $diagnosticosPaginados);

// Registrar consulta
registrarLog("RESULTADOS_CONSULTADOS", [
    'metodo' => $metodo,
    'tipo' => $tipo,
    'producto' => $producto,
    'total_filtrados' => $totalFiltrados,
    'pagina' => $pagina,
    'limite' => $limite,
    'ip' => $_SERVER['REMOTE_ADDR'] ?? ''
]);

// Retornar resultados
echo json_encode([
    'success' => true,
    'total_diagnosticos' => $totalDiagnosticos,
    'total_filtrados' => $totalFiltrados,
    'pagina_actual' => $pagina,
    'total_paginas' => ceil($totalFiltrados / $limite),
    'limite_por_pagina' => $limite,
    'estadisticas' => $estadisticas,
    'diagnosticos' => $respuestaDiagnosticos
]);

/**
 * Calcular estadísticas de los diagnósticos
 */
function calcularEstadisticas($diagnosticos) {
    if (empty($diagnosticos)) {
        return [
            'total' => 0,
            'por_producto' => ['personas' => 0, 'empresas' => 0],
            'por_estado' => [],
            'promedio_global' => 0
        ];
    }
    
    $estadisticas = [
        'total' => count($diagnosticos),
        'por_producto' => ['personas' => 0, 'empresas' => 0],
        'por_estado' => [],
        'promedio_global' => 0
    ];
    
    $sumaPromedios = 0;
    
    foreach ($diagnosticos as $diagnostico) {
        // Por producto
        $producto = $diagnostico['producto'] ?? '';
        if (isset($estadisticas['por_producto'][$producto])) {
            $estadisticas['por_producto'][$producto]++;
        }
        
        // Por estado
        $estado = $diagnostico['estado_sistema'] ?? 'DESCONOCIDO';
        if (!isset($estadisticas['por_estado'][$estado])) {
            $estadisticas['por_estado'][$estado] = 0;
        }
        $estadisticas['por_estado'][$estado]++;
        
        // Suma para promedio
        $sumaPromedios += $diagnostico['promedio_global'] ?? 0;
    }
    
    // Calcular promedio global
    if ($estadisticas['total'] > 0) {
        $estadisticas['promedio_global'] = round($sumaPromedios / $estadisticas['total'], 1);
    }
    
    return $estadisticas;
}
?>