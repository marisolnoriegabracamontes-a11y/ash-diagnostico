/**
 * CHARTS.JS - Sistema de gráficos ASH
 * Maneja la visualización de resultados con Chart.js
 */

class ASHCharts {
    constructor() {
        this.charts = new Map();
        this.colors = {
            primary: '#1a1a1a',
            accent: '#d4af37',
            success: '#198754',
            warning: '#ffc107',
            danger: '#dc3545',
            info: '#0dcaf0',
            
            // Colores para dimensiones
            dimensionColors: [
                '#1a1a1a', // Negro
                '#d4af37', // Dorado
                '#6c757d', // Gris
                '#495057', // Gris oscuro
                '#adb5bd', // Gris claro
                '#343a40', // Gris muy oscuro
                '#e9ecef'  // Gris muy claro
            ]
        };
        
        this.init();
    }
    
    init() {
        // Cargar Chart.js si no está cargado
        if (typeof Chart === 'undefined') {
            this.loadChartJS().then(() => {
                this.setupCharts();
            });
        } else {
            this.setupCharts();
        }
    }
    
    async loadChartJS() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
    
    setupCharts() {
        // Configuración global de Chart.js
        Chart.defaults.font.family = "'Inter', -apple-system, sans-serif";
        Chart.defaults.color = '#6c757d';
        Chart.defaults.borderColor = 'rgba(0, 0, 0, 0.1)';
        
        // Buscar y crear gráficos en la página
        this.createRadarChart();
        this.createProgressChart();
        this.createBarChart();
        this.createKPIs();
        
        // Escuchar cambios en los datos
        this.setupDataListeners();
    }
    
    createRadarChart(containerId = 'radarChart', data = null) {
        const canvas = document.getElementById(containerId);
        if (!canvas) return null;
        
        const ctx = canvas.getContext('2d');
        
        // Datos de ejemplo si no se proporcionan
        const chartData = data || this.getSampleRadarData();
        
        const chart = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: chartData.labels,
                datasets: [{
                    label: 'Estabilidad',
                    data: chartData.values,
                    backgroundColor: this.getRadarBackgroundColor(chartData.values),
                    borderColor: this.getRadarBorderColor(chartData.values),
                    borderWidth: 2,
                    pointBackgroundColor: this.getRadarBorderColor(chartData.values),
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const value = context.raw;
                                const label = context.label;
                                const status = this.getStatusFromValue(value);
                                return `${label}: ${value}/5 (${status})`;
                            }
                        },
                        backgroundColor: 'rgba(26, 26, 26, 0.9)',
                        titleColor: '#ffffff',
                        bodyColor: '#ffffff',
                        borderColor: '#d4af37',
                        borderWidth: 1
                    }
                },
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 5,
                        ticks: {
                            stepSize: 1,
                            backdropColor: 'transparent',
                            color: '#6c757d',
                            font: {
                                size: 12
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        angleLines: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        pointLabels: {
                            color: '#495057',
                            font: {
                                size: 14,
                                weight: '500'
                            },
                            padding: 15
                        }
                    }
                },
                animation: {
                    duration: 1000,
                    easing: 'easeOutQuart'
                }
            }
        });
        
        this.charts.set(containerId, chart);
        return chart;
    }
    
    createProgressChart(containerId = 'progressChart', data = null) {
        const canvas = document.getElementById(containerId);
        if (!canvas) return null;
        
        const ctx = canvas.getContext('2d');
        const chartData = data || this.getSampleProgressData();
        
        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: chartData.labels,
                datasets: [{
                    label: 'Puntuación',
                    data: chartData.values,
                    backgroundColor: this.getProgressColors(chartData.values),
                    borderColor: this.colors.primary,
                    borderWidth: 1,
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return `Puntuación: ${context.raw}/5`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        max: 5,
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.05)'
                        },
                        ticks: {
                            stepSize: 1,
                            color: '#6c757d'
                        }
                    },
                    y: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: '#495057',
                            font: {
                                weight: '500'
                            }
                        }
                    }
                },
                animation: {
                    duration: 1500,
                    easing: 'easeOutQuart'
                }
            }
        });
        
        this.charts.set(containerId, chart);
        return chart;
    }
    
    createBarChart(containerId = 'barChart', data = null) {
        const canvas = document.getElementById(containerId);
        if (!canvas) return null;
        
        const ctx = canvas.getContext('2d');
        const chartData = data || this.getSampleBarData();
        
        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: chartData.labels,
                datasets: chartData.datasets.map((dataset, index) => ({
                    label: dataset.label,
                    data: dataset.data,
                    backgroundColor: this.colors.dimensionColors[index % this.colors.dimensionColors.length],
                    borderColor: this.colors.primary,
                    borderWidth: 1,
                    borderRadius: 4,
                    borderSkipped: false
                }))
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: '#495057',
                            padding: 20,
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: '#6c757d'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        max: 5,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        },
                        ticks: {
                            stepSize: 1,
                            color: '#6c757d'
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });
        
        this.charts.set(containerId, chart);
        return chart;
    }
    
    createKPIs(containerId = 'kpiGrid') {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const kpis = [
            { label: 'Promedio Global', value: '3.8', trend: 'up', change: '+0.2' },
            { label: 'Estabilidad', value: '72%', trend: 'up', change: '+5%' },
            { label: 'Riesgo Crítico', value: '2', trend: 'down', change: '-1' },
            { label: 'Tiempo Respuesta', value: '4.2', trend: 'neutral', change: '0.0' }
        ];
        
        container.innerHTML = kpis.map(kpi => `
            <div class="kpi-item">
                <div class="kpi-name">${kpi.label}</div>
                <div class="kpi-value">${kpi.value}</div>
                <div class="kpi-trend trend-${kpi.trend}">
                    <i class="fas fa-arrow-${kpi.trend === 'up' ? 'up' : kpi.trend === 'down' ? 'down' : 'minus'}"></i>
                    ${kpi.change}
                </div>
            </div>
        `).join('');
    }
    
    getSampleRadarData() {
        return {
            labels: ['Liderazgo', 'Clima', 'Retención', 'Desempeño', 'Adaptación'],
            values: [4.2, 2.1, 2.8, 4.5, 3.4]
        };
    }
    
    getSampleProgressData() {
        return {
            labels: ['Liderazgo', 'Clima', 'Retención', 'Desempeño', 'Adaptación'],
            values: [4.2, 2.1, 2.8, 4.5, 3.4]
        };
    }
    
    getSampleBarData() {
        return {
            labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May'],
            datasets: [
                {
                    label: 'Personas',
                    data: [3.2, 3.5, 3.8, 4.0, 4.2]
                },
                {
                    label: 'Empresas',
                    data: [2.8, 3.0, 3.2, 3.5, 3.8]
                }
            ]
        };
    }
    
    getRadarBackgroundColor(values) {
        return values.map(value => {
            const alpha = 0.2;
            if (value >= 4) return `rgba(25, 135, 84, ${alpha})`; // Verde
            if (value >= 3) return `rgba(255, 193, 7, ${alpha})`; // Amarillo
            return `rgba(220, 53, 69, ${alpha})`; // Rojo
        });
    }
    
    getRadarBorderColor(values) {
        return values.map(value => {
            if (value >= 4) return this.colors.success; // Verde
            if (value >= 3) return this.colors.warning; // Amarillo
            return this.colors.danger; // Rojo
        });
    }
    
    getProgressColors(values) {
        return values.map(value => {
            if (value >= 4) return this.colors.success;
            if (value >= 3) return this.colors.warning;
            return this.colors.danger;
        });
    }
    
    getStatusFromValue(value) {
        if (value >= 4) return 'Excelente';
        if (value >= 3) return 'Adecuado';
        if (value >= 2) return 'Mejorable';
        return 'Crítico';
    }
    
    setupDataListeners() {
        // Escuchar eventos de actualización de datos
        document.addEventListener('ash:data-update', (event) => {
            this.updateCharts(event.detail);
        });
        
        // Escalar gráficos en resize
        window.addEventListener('resize', () => {
            this.charts.forEach(chart => {
                chart.resize();
            });
        });
    }
    
    updateCharts(data) {
        // Actualizar gráfico radar si existe
        if (data.radar && this.charts.has('radarChart')) {
            const chart = this.charts.get('radarChart');
            chart.data.labels = data.radar.labels;
            chart.data.datasets[0].data = data.radar.values;
            chart.update();
        }
        
        // Actualizar otros gráficos según los datos recibidos
        if (data.progress && this.charts.has('progressChart')) {
            const chart = this.charts.get('progressChart');
            chart.data.labels = data.progress.labels;
            chart.data.datasets[0].data = data.progress.values;
            chart.update();
        }
    }
    
    // Métodos de utilidad
    static formatNumber(value, decimals = 1) {
        return parseFloat(value).toFixed(decimals);
    }
    
    static getColorForValue(value, max = 5) {
        const percentage = value / max;
        
        if (percentage >= 0.8) return '#198754'; // Verde
        if (percentage >= 0.6) return '#ffc107'; // Amarillo
        if (percentage >= 0.4) return '#fd7e14'; // Naranja
        return '#dc3545'; // Rojo
    }
    
    static createGaugeChart(canvasId, value, max = 5) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;
        
        const ctx = canvas.getContext('2d');
        const percentage = value / max;
        const color = this.getColorForValue(value, max);
        
        // Dibujar gauge manualmente
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(centerX, centerY) - 10;
        
        // Fondo
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#f8f9fa';
        ctx.fill();
        ctx.strokeStyle = '#e9ecef';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Arco de progreso
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + (Math.PI * 2 * percentage);
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.strokeStyle = color;
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.stroke();
        
        // Texto
        ctx.fillStyle = '#1a1a1a';
        ctx.font = 'bold 24px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(value.toFixed(1), centerX, centerY - 15);
        
        ctx.fillStyle = '#6c757d';
        ctx.font = '12px Inter';
        ctx.fillText('/' + max, centerX, centerY + 15);
        
        return {
            update: (newValue) => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                this.createGaugeChart(canvasId, newValue, max);
            }
        };
    }
    
    // Exportar gráficos como imagen
    static exportChart(chartId, format = 'png') {
        const chart = window.ashCharts?.charts.get(chartId);
        if (!chart) {
            console.error('Chart not found:', chartId);
            return null;
        }
        
        const link = document.createElement('a');
        link.download = `ash-chart-${chartId}-${new Date().getTime()}.${format}`;
        link.href = chart.toBase64Image();
        link.click();
        
        return link.href;
    }
    
    // Exportar todos los gráficos como PDF
    static async exportAllCharts() {
        const charts = Array.from(window.ashCharts?.charts.values() || []);
        if (charts.length === 0) {
            console.warn('No charts to export');
            return;
        }
        
        // En una implementación real, usaríamos una librería como jsPDF
        console.log('Exporting charts:', charts.length);
        
        // Por ahora, descargar cada gráfico individualmente
        charts.forEach((chart, index) => {
            setTimeout(() => {
                this.exportChart(`chart-${index}`, 'png');
            }, index * 100);
        });
    }
}

// Inicializar automáticamente
document.addEventListener('DOMContentLoaded', () => {
    // Solo inicializar en páginas que necesiten gráficos
    if (document.querySelector('canvas') || document.getElementById('kpiGrid')) {
        window.ashCharts = new ASHCharts();
    }
});

// Añadir estilos CSS para gráficos
const chartStyles = document.createElement('style');
chartStyles.textContent = `
    .chart-container {
        position: relative;
        width: 100%;
        height: 400px;
    }
    
    .kpi-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1.5rem;
        margin: 2rem 0;
    }
    
    .kpi-item {
        background: white;
        border-radius: 12px;
        padding: 1.5rem;
        border: 1px solid #e9ecef;
        text-align: center;
        transition: all 0.3s ease;
    }
    
    .kpi-item:hover {
        transform: translateY(-4px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
    }
    
    .kpi-name {
        font-size: 14px;
        color: #6c757d;
        margin-bottom: 0.5rem;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    
    .kpi-value {
        font-size: 2rem;
        font-weight: 600;
        color: #1a1a1a;
        margin-bottom: 0.5rem;
        line-height: 1;
    }
    
    .kpi-trend {
        font-size: 13px;
        font-weight: 500;
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.25rem 0.75rem;
        border-radius: 20px;
    }
    
    .trend-up {
        background: rgba(25, 135, 84, 0.1);
        color: #198754;
    }
    
    .trend-down {
        background: rgba(220, 53, 69, 0.1);
        color: #dc3545;
    }
    
    .trend-neutral {
        background: rgba(108, 117, 125, 0.1);
        color: #6c757d;
    }
    
    .chart-legend {
        display: flex;
        justify-content: center;
        gap: 1rem;
        margin-top: 1rem;
        flex-wrap: wrap;
    }
    
    .legend-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 14px;
        color: #495057;
    }
    
    .legend-color {
        width: 12px;
        height: 12px;
        border-radius: 2px;
    }
    
    @keyframes chartFadeIn {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    .chart-animated {
        animation: chartFadeIn 0.8s ease;
    }
`;

document.head.appendChild(chartStyles);