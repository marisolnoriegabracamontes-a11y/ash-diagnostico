/**
 * WIZARD.JS - Sistema de cuestionario ASH
 * Maneja el flujo de preguntas y respuestas
 */

class ASHWizard {
    constructor(config = {}) {
        this.config = {
            apiBase: 'includes/',
            sessionKey: 'ash_session',
            product: config.product || 'personas',
            questionsPerPage: config.questionsPerPage || 5,
            totalQuestions: config.totalQuestions || 25,
            showProgress: config.showProgress !== false
        };
        
        this.state = {
            currentQuestion: 0,
            answers: new Array(this.config.totalQuestions).fill(null),
            dimensionData: {},
            isLoading: false,
            hasCompleted: false
        };
        
        this.elements = {};
        this.questions = [];
        this.dimensions = [];
        
        this.init();
    }
    
    async init() {
        // Verificar autenticación
        if (!this.checkAuth()) {
            return;
        }
        
        this.cacheElements();
        this.bindEvents();
        await this.loadQuestions();
        this.renderQuestion();
        this.updateProgress();
    }
    
    checkAuth() {
        const session = ASHAuth.getSession();
        if (!session || session.product !== this.config.product) {
            // Redirigir a la página de autenticación correcta
            window.location.href = `auth-${this.config.product}.html`;
            return false;
        }
        
        // Guardar sesión actual
        this.session = session;
        return true;
    }
    
    cacheElements() {
        this.elements = {
            questionContainer: document.getElementById('questionContainer'),
            btnPrev: document.getElementById('btnPrev'),
            btnNext: document.getElementById('btnNext'),
            currentStep: document.getElementById('currentStep'),
            progressPercent: document.getElementById('progressPercent'),
            progressFill: document.getElementById('progressFill'),
            currentQuestion: document.getElementById('currentQuestion'),
            questionCounter: document.getElementById('questionCounter'),
            optionsGrid: document.getElementById('optionsGrid')
        };
    }
    
    bindEvents() {
        if (this.elements.btnPrev) {
            this.elements.btnPrev.addEventListener('click', () => this.prevQuestion());
        }
        
        if (this.elements.btnNext) {
            this.elements.btnNext.addEventListener('click', () => this.nextQuestion());
        }
        
        // Atajos de teclado
        document.addEventListener('keydown', (e) => this.handleKeydown(e));
    }
    
    handleKeydown(event) {
        // Solo procesar si no estamos en un input
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            return;
        }
        
        switch (event.key) {
            case 'ArrowLeft':
                if (!this.elements.btnPrev.disabled) {
                    this.prevQuestion();
                }
                break;
                
            case 'ArrowRight':
            case 'Enter':
                if (!this.elements.btnNext.disabled) {
                    this.nextQuestion();
                }
                break;
                
            case '1':
            case '2':
            case '3':
            case '4':
                const optionIndex = parseInt(event.key) - 1;
                this.selectOption(optionIndex);
                break;
                
            case 'a':
            case 'A':
                this.selectOption(0);
                break;
            case 'b':
            case 'B':
                this.selectOption(1);
                break;
            case 'c':
            case 'C':
                this.selectOption(2);
                break;
            case 'd':
            case 'D':
                this.selectOption(3);
                break;
        }
    }
    
    async loadQuestions() {
        // En una implementación real, cargaría de un archivo o API
        // Por ahora usamos datos embebidos
        
        if (this.config.product === 'personas') {
            this.dimensions = [
                {
                    id: 1,
                    name: 'Liderazgo',
                    description: 'Capacidad de dirección y guía de equipos',
                    questions: this.generateQuestions('Liderazgo', 5)
                },
                {
                    id: 2,
                    name: 'Clima Organizacional',
                    description: 'Ambiente laboral y relaciones interpersonales',
                    questions: this.generateQuestions('Clima', 5)
                },
                {
                    id: 3,
                    name: 'Retención de Talento',
                    description: 'Capacidad para mantener y desarrollar al personal clave',
                    questions: this.generateQuestions('Retención', 5)
                },
                {
                    id: 4,
                    name: 'Desempeño',
                    description: 'Efectividad y productividad del capital humano',
                    questions: this.generateQuestions('Desempeño', 5)
                },
                {
                    id: 5,
                    name: 'Adaptación',
                    description: 'Capacidad de cambio y resiliencia organizacional',
                    questions: this.generateQuestions('Adaptación', 5)
                }
            ];
        } else {
            this.dimensions = [
                {
                    id: 1,
                    name: 'Gobernanza',
                    description: 'Estructura de gobierno y toma de decisiones',
                    questions: this.generateQuestions('Gobernanza', 4)
                },
                {
                    id: 2,
                    name: 'Procesos',
                    description: 'Eficiencia y estandarización operativa',
                    questions: this.generateQuestions('Procesos', 4)
                },
                {
                    id: 3,
                    name: 'Tecnología',
                    description: 'Infraestructura y capacidades digitales',
                    questions: this.generateQuestions('Tecnología', 3)
                },
                {
                    id: 4,
                    name: 'Finanzas',
                    description: 'Gestión y control financiero',
                    questions: this.generateQuestions('Finanzas', 4)
                },
                {
                    id: 5,
                    name: 'Mercado',
                    description: 'Posicionamiento y competitividad',
                    questions: this.generateQuestions('Mercado', 3)
                },
                {
                    id: 6,
                    name: 'Talento',
                    description: 'Capital humano y desarrollo organizacional',
                    questions: this.generateQuestions('Talento', 4)
                },
                {
                    id: 7,
                    name: 'Escalabilidad',
                    description: 'Capacidad de crecimiento sostenible',
                    questions: this.generateQuestions('Escalabilidad', 3)
                }
            ];
        }
        
        // Aplanar todas las preguntas
        this.questions = [];
        this.dimensions.forEach(dimension => {
            dimension.questions.forEach(question => {
                this.questions.push({
                    ...question,
                    dimension: dimension.name,
                    dimensionId: dimension.id
                });
            });
        });
        
        // Ajustar total de preguntas
        this.config.totalQuestions = this.questions.length;
        this.state.answers = new Array(this.config.totalQuestions).fill(null);
    }
    
    generateQuestions(dimension, count) {
        const questions = [];
        const templates = this.getQuestionTemplates(dimension);
        
        for (let i = 1; i <= count; i++) {
            const template = templates[i % templates.length];
            questions.push({
                id: questions.length + 1,
                text: `${template.prefix} ${dimension.toLowerCase()}?`,
                description: `Evaluación de ${dimension.toLowerCase()} - Pregunta ${i}`,
                options: [
                    { id: 0, text: template.options[0], value: 1 },
                    { id: 1, text: template.options[1], value: 2 },
                    { id: 2, text: template.options[2], value: 3 },
                    { id: 3, text: template.options[3], value: 4 }
                ],
                dimension: dimension
            });
        }
        
        return questions;
    }
    
    getQuestionTemplates(dimension) {
        const templates = {
            'Liderazgo': [
                {
                    prefix: '¿Cómo se ejerce la autoridad en situaciones de',
                    options: [
                        'Autoritario y centralizado',
                        'Participativo con límites claros',
                        'Colaborativo y consensuado',
                        'Adaptativo según la situación'
                    ]
                },
                {
                    prefix: '¿Cuál es el nivel de delegación en',
                    options: [
                        'Mínima, todo centralizado',
                        'Limitada a tareas operativas',
                        'Moderada con supervisión',
                        'Alta con autonomía completa'
                    ]
                }
            ],
            'Clima': [
                {
                    prefix: '¿Cómo es la comunicación en el ambiente de',
                    options: [
                        'Tensa y jerárquica',
                        'Formal y estructurada',
                        'Abierta y respetuosa',
                        'Colaborativa y transparente'
                    ]
                }
            ],
            // Agregar más templates según sea necesario
        };
        
        return templates[dimension] || [{
            prefix: '¿Cómo evaluaría el nivel de',
            options: [
                'Muy bajo o inexistente',
                'Bajo, necesita mejoras significativas',
                'Adecuado, con áreas de oportunidad',
                'Excelente, fortaleza organizacional'
            ]
        }];
    }
    
    renderQuestion() {
        if (this.state.isLoading || this.state.hasCompleted) {
            return;
        }
        
        const question = this.questions[this.state.currentQuestion];
        const dimension = this.dimensions.find(d => d.name === question.dimension);
        
        // Actualizar UI
        if (this.elements.currentStep) {
            this.elements.currentStep.textContent = `${question.dimension} - Pregunta ${(this.state.currentQuestion % 5) + 1}`;
        }
        
        if (this.elements.currentQuestion) {
            this.elements.currentQuestion.textContent = this.state.currentQuestion + 1;
        }
        
        // Actualizar botones
        this.updateNavigationButtons();
        
        // Renderizar pregunta
        this.elements.questionContainer.innerHTML = `
            <div class="question-header">
                <div class="dimension-badge">${question.dimension}</div>
                <h2 class="question-title">${question.text}</h2>
                <p class="question-description">
                    ${dimension?.description || 'Selecciona la opción que mejor describa la situación actual'}
                </p>
            </div>
            
            <div class="options-grid" id="optionsGrid">
                ${question.options.map((option, index) => `
                    <div class="option-card ${this.state.answers[this.state.currentQuestion] === index ? 'selected' : ''}" 
                         data-index="${index}"
                         data-value="${option.value}">
                        <div class="option-letter">${String.fromCharCode(65 + index)}</div>
                        <div class="option-text">${option.text}</div>
                    </div>
                `).join('')}
            </div>
        `;
        
        // Agregar event listeners a las opciones
        setTimeout(() => {
            document.querySelectorAll('.option-card').forEach(card => {
                card.addEventListener('click', (e) => {
                    const index = parseInt(card.getAttribute('data-index'));
                    this.selectOption(index);
                });
            });
        }, 100);
        
        // Animación de entrada
        this.elements.questionContainer.style.animation = 'none';
        setTimeout(() => {
            this.elements.questionContainer.style.animation = 'fadeIn 0.5s ease';
        }, 10);
    }
    
    selectOption(index) {
        const question = this.questions[this.state.currentQuestion];
        
        if (index < 0 || index >= question.options.length) {
            return;
        }
        
        // Actualizar estado
        this.state.answers[this.state.currentQuestion] = index;
        
        // Actualizar UI
        document.querySelectorAll('.option-card').forEach(card => {
            card.classList.remove('selected');
        });
        
        const selectedCard = document.querySelector(`.option-card[data-index="${index}"]`);
        if (selectedCard) {
            selectedCard.classList.add('selected');
        }
        
        // Habilitar siguiente
        this.elements.btnNext.disabled = false;
        
        // Guardar progreso automáticamente
        this.saveProgress();
    }
    
    updateNavigationButtons() {
        if (!this.elements.btnPrev || !this.elements.btnNext) return;
        
        // Botón anterior
        this.elements.btnPrev.disabled = this.state.currentQuestion === 0;
        
        // Botón siguiente
        const hasAnswer = this.state.answers[this.state.currentQuestion] !== null;
        const isLastQuestion = this.state.currentQuestion === this.config.totalQuestions - 1;
        
        this.elements.btnNext.disabled = !hasAnswer;
        this.elements.btnNext.innerHTML = isLastQuestion ? 
            '<span>Finalizar</span><i class="fas fa-check"></i>' :
            '<span>Siguiente</span><i class="fas fa-arrow-right"></i>';
    }
    
    updateProgress() {
        if (!this.config.showProgress) return;
        
        const progress = ((this.state.currentQuestion + 1) / this.config.totalQuestions) * 100;
        
        if (this.elements.progressPercent) {
            this.elements.progressPercent.textContent = `${Math.round(progress)}%`;
        }
        
        if (this.elements.progressFill) {
            this.elements.progressFill.style.width = `${progress}%`;
        }
    }
    
    prevQuestion() {
        if (this.state.currentQuestion > 0 && !this.state.isLoading) {
            this.state.currentQuestion--;
            this.renderQuestion();
            this.updateProgress();
        }
    }
    
    async nextQuestion() {
        if (this.state.isLoading) return;
        
        // Validar respuesta actual
        if (this.state.answers[this.state.currentQuestion] === null) {
            this.showNotification('Por favor selecciona una opción antes de continuar', 'warning');
            return;
        }
        
        // Si es la última pregunta, procesar resultados
        if (this.state.currentQuestion === this.config.totalQuestions - 1) {
            await this.processResults();
            return;
        }
        
        // Siguiente pregunta
        this.state.currentQuestion++;
        this.renderQuestion();
        this.updateProgress();
    }
    
    async processResults() {
        this.state.isLoading = true;
        
        // Mostrar pantalla de carga
        this.showLoadingScreen();
        
        try {
            // Calcular puntuaciones
            const scores = this.calculateScores();
            
            // Preparar datos para enviar
            const session = ASHAuth.getSession();
            const payload = {
                token: session?.token,
                producto: this.config.product,
                respuestas: this.state.answers,
                puntuaciones: scores,
                promedio_global: this.calculateAverage(scores),
                fecha: new Date().toISOString()
            };
            
            // Enviar al servidor
            const response = await this.submitResults(payload);
            
            if (response.success) {
                // Redirigir a resultados
                setTimeout(() => {
                    window.location.href = `results-${this.config.product}.html`;
                }, 1500);
            } else {
                throw new Error(response.message || 'Error al procesar resultados');
            }
            
        } catch (error) {
            console.error('Error:', error);
            this.showErrorScreen(error.message);
            this.state.isLoading = false;
        }
    }
    
    calculateScores() {
        const scores = {};
        
        // Agrupar respuestas por dimensión
        this.dimensions.forEach(dimension => {
            const dimensionQuestions = this.questions.filter(q => q.dimension === dimension.name);
            let totalScore = 0;
            let answeredCount = 0;
            
            dimensionQuestions.forEach(question => {
                const answerIndex = this.state.answers[question.id - 1];
                if (answerIndex !== null) {
                    const option = question.options[answerIndex];
                    totalScore += option.value;
                    answeredCount++;
                }
            });
            
            if (answeredCount > 0) {
                // Convertir a escala 1-5
                scores[dimension.name] = (totalScore / answeredCount).toFixed(1);
            }
        });
        
        return scores;
    }
    
    calculateAverage(scores) {
        const values = Object.values(scores).map(v => parseFloat(v));
        if (values.length === 0) return 0;
        
        const sum = values.reduce((a, b) => a + b, 0);
        return (sum / values.length).toFixed(1);
    }
    
    async submitResults(payload) {
        const response = await fetch(`${this.config.apiBase}guardar-resultados.php`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    }
    
    showLoadingScreen() {
        this.elements.questionContainer.innerHTML = `
            <div class="loading-screen">
                <div class="loading-spinner"></div>
                <h2>Procesando resultados...</h2>
                <p>Analizando las respuestas para generar tu diagnóstico ejecutivo</p>
                <div class="loading-details">
                    <p><small>Este proceso puede tomar unos segundos</small></p>
                </div>
            </div>
        `;
        
        // Deshabilitar navegación
        this.elements.btnPrev.disabled = true;
        this.elements.btnNext.disabled = true;
    }
    
    showErrorScreen(message) {
        this.elements.questionContainer.innerHTML = `
            <div class="completion-screen">
                <div class="completion-icon error">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <h2>Error en el procesamiento</h2>
                <p>${message}</p>
                <div class="error-actions">
                    <button class="btn-nav btn-primary" id="retryBtn">
                        <i class="fas fa-redo"></i>
                        <span>Reintentar</span>
                    </button>
                    <button class="btn-nav btn-secondary" id="cancelBtn">
                        <i class="fas fa-times"></i>
                        <span>Cancelar</span>
                    </button>
                </div>
            </div>
        `;
        
        // Agregar event listeners
        setTimeout(() => {
            document.getElementById('retryBtn')?.addEventListener('click', () => {
                this.state.isLoading = false;
                this.renderQuestion();
            });
            
            document.getElementById('cancelBtn')?.addEventListener('click', () => {
                window.location.href = `auth-${this.config.product}.html`;
            });
        }, 100);
    }
    
    showNotification(message, type = 'info') {
        // Crear notificación
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
                <span>${message}</span>
            </div>
            <button class="notification-close">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        // Estilos
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'warning' ? '#fef3c7' : '#dbeafe'};
            border: 1px solid ${type === 'warning' ? '#fbbf24' : '#93c5fd'};
            border-radius: 8px;
            padding: 12px 16px;
            display: flex;
            align-items: center;
            gap: 12px;
            max-width: 400px;
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remover después de 5 segundos
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 5000);
        
        // Botón de cerrar
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.remove();
        });
    }
    
    saveProgress() {
        // Guardar en localStorage como backup
        const progress = {
            currentQuestion: this.state.currentQuestion,
            answers: this.state.answers,
            timestamp: new Date().toISOString(),
            product: this.config.product
        };
        
        localStorage.setItem(`ash_wizard_${this.config.product}`, JSON.stringify(progress));
    }
    
    loadProgress() {
        const saved = localStorage.getItem(`ash_wizard_${this.config.product}`);
        if (saved) {
            try {
                const progress = JSON.parse(saved);
                
                // Verificar que no sea muy viejo (máximo 1 hora)
                const savedTime = new Date(progress.timestamp);
                const now = new Date();
                const hoursDiff = (now - savedTime) / (1000 * 60 * 60);
                
                if (hoursDiff < 1 && progress.product === this.config.product) {
                    this.state.currentQuestion = progress.currentQuestion;
                    this.state.answers = progress.answers;
                    return true;
                }
            } catch (error) {
                console.error('Error al cargar progreso:', error);
            }
        }
        return false;
    }
    
    // Método estático para limpiar progreso guardado
    static clearProgress(product) {
        localStorage.removeItem(`ash_wizard_${product}`);
    }
}

// Inicializar wizard según la página
document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    
    if (path.includes('wizard-personas.html')) {
        window.ashWizard = new ASHWizard({
            product: 'personas',
            totalQuestions: 25
        });
    } else if (path.includes('wizard-empresas.html')) {
        window.ashWizard = new ASHWizard({
            product: 'empresas',
            totalQuestions: 25
        });
    }
});