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

// Validar datos mínimos
$producto = sanitizar($input['producto'] ?? '');
$token = sanitizar($input['token'] ?? ''); // Token de sesión
$respuestas = $input['respuestas'] ?? [];
$puntuaciones = $input['puntuaciones'] ?? [];

if (empty($producto) || ($producto !== 'personas' && $producto !== 'empresas')) {
    echo json_encode([
        'success' => false,
        'message' => 'Producto inválido o no especificado.'
    ]);
    exit;
}

if (empty($respuestas) || !is_array($respuestas)) {
    echo json_encode([
        'success' => false,
        'message' => 'Respuestas del diagnóstico requeridas.'
    ]);
    exit;
}

// Verificar sesión si se proporciona token
$emailCliente = '';
$claveId = null;

if (!empty($token)) {
    $sessions = leerJSON(SESIONES_FILE);
    
    if (isset($sessions[$token])) {
        $session = $sessions[$token];
        
        // Verificar expiración
        if (strtotime($session['expira_en']) >= time()) {
            $emailCliente = $session['email'] ?? '';
            $claveId = $session['clave_id'] ?? null;
            $producto = $session['producto'] ?? $producto;
            
            // Eliminar sesión después de usar
            unset($sessions[$token]);
            guardarJSON(SESIONES_FILE, $sessions);
        }
    }
}

// Si no hay email del cliente, usar uno genérico
if (empty($emailCliente)) {
    $emailCliente = 'cliente@diagnostico.ash';
}

// Calcular o usar puntuaciones proporcionadas
if (empty($puntuaciones)) {
    $puntuaciones = calcularPuntuaciones($respuestas, $producto);
}

// Calcular métricas generales
$promedioGlobal = calcularPromedioGlobal($puntuaciones);
$estadoSistema = determinarEstadoSistema($promedioGlobal);
$prioridadIntervencion = determinarPrioridad($promedioGlobal, $puntuaciones);

// Generar hallazgos clave
$hallazgos = generarHallazgos($puntuaciones, $producto);

// Generar recomendaciones
$recomendaciones = generarRecomendaciones($puntuaciones, $producto, $estadoSistema);

// Preparar datos del diagnóstico
$diagnosticoId = time() . '_' . uniqid();
$fechaDiagnostico = date('Y-m-d H:i:s');

$diagnosticoData = [
    'id' => $diagnosticoId,
    'fecha' => $fechaDiagnostico,
    'producto' => $producto,
    'email_cliente' => $emailCliente,
    'clave_id' => $claveId,
    'ip_cliente' => $_SERVER['REMOTE_ADDR'] ?? '',
    'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? '',
    
    // Resultados
    'respuestas' => $respuestas,
    'puntuaciones' => $puntuaciones,
    'promedio_global' => round($promedioGlobal, 1),
    'estado_sistema' => $estadoSistema,
    'prioridad' => $prioridadIntervencion,
    
    // Análisis
    'hallazgos' => $hallazgos,
    'recomendaciones' => $recomendaciones,
    
    // Metadata
    'procesado_en' => $fechaDiagnostico,
    'version_sistema' => SISTEMA_VERSION
];

// Guardar en base de datos
$diagnosticosData = leerJSON(DIAGNOSTICOS_FILE);

// Asignar ID numérico
$diagnosticoData['id_num'] = ++$diagnosticosData['contador'];

// Agregar a la lista
$diagnosticosData['diagnosticos'][] = $diagnosticoData;

// Guardar
if (!guardarJSON(DIAGNOSTICOS_FILE, $diagnosticosData)) {
    echo json_encode([
        'success' => false,
        'message' => 'Error al guardar los resultados en la base de datos.'
    ]);
    exit;
}

// Si hay clave asociada, marcarla como usada
if ($claveId !== null) {
    // Buscar la clave
    $clavesData = leerJSON(CLAVES_FILE);
    
    foreach ($clavesData['claves'] as $index => $claveDB) {
        if ($claveDB['id'] === $claveId) {
            $clavesData['claves'][$index]['usada'] = true;
            $clavesData['claves'][$index]['usada_en'] = $fechaDiagnostico;
            $clavesData['claves'][$index]['diagnostico_id'] = $diagnosticoId;
            break;
        }
    }
    
    guardarJSON(CLAVES_FILE, $clavesData);
}

// Enviar correo con resultados al consultor
$correoEnviado = enviarCorreoResultados(TU_EMAIL, $diagnosticoData);

// Registrar el diagnóstico
registrarLog("DIAGNOSTICO_GUARDADO", [
    'diagnostico_id' => $diagnosticoId,
    'producto' => $producto,
    'email_cliente' => $emailCliente,
    'promedio_global' => $promedioGlobal,
    'estado_sistema' => $estadoSistema,
    'correo_enviado' => $correoEnviado
]);

// Retornar éxito con datos del diagnóstico
echo json_encode([
    'success' => true,
    'message' => 'Diagnóstico guardado exitosamente.',
    'diagnostico' => [
        'id' => $diagnosticoId,
        'fecha' => $fechaDiagnostico,
        'producto' => $producto,
        'promedio_global' => round($promedioGlobal, 1),
        'estado_sistema' => $estadoSistema,
        'prioridad' => $prioridadIntervencion
    ],
    'notificacion' => [
        'enviada' => $correoEnviado,
        'email_destino' => TU_EMAIL
    ]
]);

// ============================================
// FUNCIONES DE CÁLCULO
// ============================================

function calcularPuntuaciones($respuestas, $producto) {
    $puntuaciones = [];
    
    // Definir dimensiones según producto
    if ($producto === 'personas') {
        $dimensiones = ['Liderazgo', 'Clima', 'Retención', 'Desempeño', 'Adaptación'];
        $preguntasPorDimension = 5;
    } else {
        $dimensiones = ['Gobernanza', 'Procesos', 'Tecnología', 'Finanzas', 'Mercado', 'Talento', 'Escalabilidad'];
        $preguntasPorDimension = 4; // Aproximado, ajustar según cuestionario real
    }
    
    // Calcular promedio por dimensión
    foreach ($dimensiones as $index => $dimension) {
        $inicio = $index * $preguntasPorDimension;
        $fin = $inicio + $preguntasPorDimension;
        
        $respuestasDimension = array_slice($respuestas, $inicio, $preguntasPorDimension);
        
        if (!empty($respuestasDimension)) {
            // Convertir respuestas A=1, B=2, C=3, D=4 a escala 1-5
            $suma = 0;
            $contador = 0;
            
            foreach ($respuestasDimension as $respuesta) {
                if ($respuesta !== null) {
                    // Escala: 1-4 respuestas -> convertir a 1-5
                    $valor = ($respuesta + 1) * 1.25; // Convertir 1-4 a 1-5
                    $suma += $valor;
                    $contador++;
                }
            }
            
            if ($contador > 0) {
                $puntuaciones[$dimension] = round($suma / $contador, 1);
            }
        }
    }
    
    return $puntuaciones;
}

function calcularPromedioGlobal($puntuaciones) {
    if (empty($puntuaciones)) {
        return 0;
    }
    
    $suma = array_sum($puntuaciones);
    $cantidad = count($puntuaciones);
    
    return $suma / $cantidad;
}

function determinarEstadoSistema($promedio) {
    if ($promedio >= 4.0) {
        return 'EXCELENTE';
    } elseif ($promedio >= 3.0) {
        return 'ESTABLE';
    } elseif ($promedio >= 2.0) {
        return 'ALERTA';
    } else {
        return 'CRÍTICO';
    }
}

function determinarPrioridad($promedio, $puntuaciones) {
    // Si el promedio es bajo, prioridad alta
    if ($promedio < 2.0) {
        return 'URGENTE';
    }
    
    // Verificar si hay dimensiones críticas
    $dimensionesCriticas = 0;
    foreach ($puntuaciones as $puntuacion) {
        if ($puntuacion < 2.0) {
            $dimensionesCriticas++;
        }
    }
    
    if ($dimensionesCriticas >= 2) {
        return 'ALTA';
    } elseif ($dimensionesCriticas >= 1 || $promedio < 3.0) {
        return 'MEDIA';
    } else {
        return 'BAJA';
    }
}

function generarHallazgos($puntuaciones, $producto) {
    $hallazgos = [];
    
    // Encontrar dimensiones más bajas
    asort($puntuaciones);
    $dimensionesBajas = array_slice($puntuaciones, 0, 3, true);
    
    foreach ($dimensionesBajas as $dimension => $puntuacion) {
        if ($puntuacion < 3.0) {
            $nivel = $puntuacion < 2.0 ? 'crítico' : ($puntuacion < 2.5 ? 'alto' : 'moderado');
            
            if ($producto === 'personas') {
                $descripciones = [
                    'Liderazgo' => 'Fortalecimiento de capacidades directivas requerido',
                    'Clima' => 'Ambiente laboral necesita intervención',
                    'Retención' => 'Riesgo significativo de rotación de talento',
                    'Desempeño' => 'Sistema de evaluación y desarrollo por mejorar',
                    'Adaptación' => 'Resiliencia organizacional limitada'
                ];
            } else {
                $descripciones = [
                    'Gobernanza' => 'Estructura de gobierno necesita formalización',
                    'Procesos' => 'Procesos operativos requieren optimización',
                    'Tecnología' => 'Infraestructura tecnológica por modernizar',
                    'Finanzas' => 'Control financiero necesita fortalecimiento',
                    'Mercado' => 'Posicionamiento competitivo vulnerable',
                    'Talento' => 'Gestión del capital humano por mejorar',
                    'Escalabilidad' => 'Limitaciones para crecimiento sostenible'
                ];
            }
            
            $hallazgos[] = [
                'dimension' => $dimension,
                'puntuacion' => $puntuacion,
                'nivel' => $nivel,
                'descripcion' => $descripciones[$dimension] ?? 'Área de mejora identificada'
            ];
        }
    }
    
    return $hallazgos;
}

function generarRecomendaciones($puntuaciones, $producto, $estadoSistema) {
    $recomendaciones = [];
    
    // Recomendación general según estado
    switch ($estadoSistema) {
        case 'CRÍTICO':
            $recomendaciones[] = 'Intervención inmediata requerida. Contacta a tu consultor IEE para plan de acción urgente.';
            break;
        case 'ALERTA':
            $recomendaciones[] = 'Acción correctiva necesaria en los próximos 30 días.';
            break;
        case 'ESTABLE':
            $recomendaciones[] = 'Monitoreo continuo y mejoras incrementales recomendadas.';
            break;
        default:
            $recomendaciones[] = 'Mantener buenas prácticas y buscar optimizaciones.';
    }
    
    // Recomendaciones específicas por dimensión baja
    asort($puntuaciones);
    foreach (array_slice($puntuaciones, 0, 2, true) as $dimension => $puntuacion) {
        if ($puntuacion < 3.0) {
            if ($producto === 'personas') {
                $recomEspecificas = [
                    'Liderazgo' => 'Implementar programa de desarrollo de líderes',
                    'Clima' => 'Realizar encuesta de clima y plan de mejora',
                    'Retención' => 'Diseñar estrategia de retención de talento clave',
                    'Desempeño' => 'Revisar sistema de evaluación y feedback',
                    'Adaptación' => 'Establecer protocolos de gestión del cambio'
                ];
            } else {
                $recomEspecificas = [
                    'Gobernanza' => 'Formalizar estructura de comités y gobierno',
                    'Procesos' => 'Documentar y optimizar procesos críticos',
                    'Tecnología' => 'Evaluar infraestructura y plan de digitalización',
                    'Finanzas' => 'Implementar controles y reportes financieros',
                    'Mercado' => 'Desarrollar estrategia de posicionamiento',
                    'Talento' => 'Crear plan de desarrollo organizacional',
                    'Escalabilidad' => 'Diseñar modelo de crecimiento escalable'
                ];
            }
            
            if (isset($recomEspecificas[$dimension])) {
                $recomendaciones[] = $recomEspecificas[$dimension];
            }
        }
    }
    
    return $recomendaciones;
}
?>