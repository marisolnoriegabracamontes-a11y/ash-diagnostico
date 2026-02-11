/**
 * ASH AUTHENTICATION SYSTEM v2.0
 * Sistema completo de autenticación con clave única
 * Maneja: verificación de claves, sesiones, validaciones y seguridad
 */

class ASHAuth {
    constructor(options = {}) {
        // Configuración
        this.config = {
            apiBase: options.apiBase || 'includes/',
            sessionKey: 'ash_session_v2',
            tokenKey: 'ash_token',
            productKey: 'ash_product',
            maxAttempts: 3,
            lockoutTime: 15 * 60 * 1000, // 15 minutos en milisegundos
            debug: options.debug || false
        };
        
        // Estado
        this.state = {
            attempts: 0,
            lastAttempt: null,
            isLocked: false,
            lockoutUntil: null,
            currentProduct: this.detectProduct(),
            session: null
        };
        
        // Elementos del DOM
        this.elements = {};
        
        // Inicializar
        this.init();
    }
    
    /**
     * Inicialización principal
     */
    init() {
        this.cacheElements();
        this.bindEvents();
        this.loadState();
        this.checkExistingSession();
        this.setupAutoLogout();
        
        if (this.config.debug) {
            console.log('ASH Auth inicializado para:', this.state.currentProduct);
        }
    }
    
    /**
     * Cachear elementos del DOM
     */
    cacheElements() {
        this.elements = {
            authForm: document.getElementById('authForm'),
            claveInput: document.getElementById('claveAcceso'),
            emailInput: document.getElementById('emailContacto'),
            submitBtn: document.getElementById('submitBtn'),
            errorMessage: document.getElementById('errorMessage'),
            successMessage: document.getElementById('successMessage'),
            errorText: document.getElementById('errorText'),
            toggleVisibility: document.getElementById('toggleVisibility'),
            productBadge: document.querySelector('.product-badge'),
            progressSteps: document.querySelectorAll('.progress-step')
        };
        
        // Actualizar UI según producto
        this.updateProductUI();
    }
    
    /**
     * Detectar producto actual por URL o página
     */
    detectProduct() {
        const path = window.location.pathname;
        const host = window.location.hostname;
        
        if (path.includes('personas') || host.includes('personas')) {
            return 'personas';
        } else if (path.includes('empresas') || host.includes('empresas')) {
            return 'empresas';
        }
        
        // Intentar detectar por contenido de página
        const pageTitle = document.title.toLowerCase();
        if (pageTitle.includes('personas')) return 'personas';
        if (pageTitle.includes('empresas')) return 'empresas';
        
        return 'personas'; // Default
    }
    
    /**
     * Actualizar UI según producto
     */
    updateProductUI() {
        const product = this.state.currentProduct;
        
        // Actualizar badge si existe
        if (this.elements.productBadge) {
            this.elements.productBadge.textContent = 
                product === 'personas' ? 'ESTABILIDAD HUMANA' : 'ESTABILIDAD ESTRUCTURAL';
        }
        
        // Actualizar placeholder del input
        if (this.elements.claveInput) {
            this.elements.claveInput.placeholder = 
                product === 'personas' ? 'Ej: ASH-P-7B3F-9A2C-1D4E' : 'Ej: ASH-E-8C4D-2A9B-3F7E';
        }
        
        // Actualizar progress steps
        if (this.elements.progressSteps && this.elements.progressSteps.length > 0) {
            this.elements.progressSteps[0].classList.add('active');
        }
    }
    
    /**
     * Vincular eventos del DOM
     */
    bindEvents() {
        // Formulario de autenticación
        if (this.elements.authForm) {
            this.elements.authForm.addEventListener('submit', (e) => this.handleSubmit(e));
        }
        
        // Toggle visibilidad de clave
        if (this.elements.toggleVisibility && this.elements.claveInput) {
            this.elements.toggleVisibility.addEventListener('click', () => this.togglePasswordVisibility());
        }
        
        // Formateo automático de clave
        if (this.elements.claveInput) {
            this.elements.claveInput.addEventListener('input', (e) => this.formatClaveInput(e));
            this.elements.claveInput.addEventListener('keydown', (e) => this.handleKeydown(e));
            this.elements.claveInput.addEventListener('paste', (e) => this.handlePaste(e));
        }
        
        // Auto-focus
        setTimeout(() => {
            if (this.elements.claveInput && !this.elements.claveInput.value) {
                this.elements.claveInput.focus();
            }
        }, 300);
        
        // Detectar cambios en conexión
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
        
        // Prevenir recarga accidental
        window.addEventListener('beforeunload', (e) => {
            if (this.state.attempts > 0) {
                e.preventDefault();
                e.returnValue = 'Tienes intentos de autenticación en curso. ¿Seguro que quieres salir?';
            }
        });
    }
    
    /**
     * Cargar estado desde localStorage
     */
    loadState() {
        try {
            const savedState = localStorage.getItem('ash_auth_state');
            if (savedState) {
                const state = JSON.parse(savedState);
                const now = Date.now();
                
                // Verificar si el bloqueo ya expiró
                if (state.lockoutUntil && state.lockoutUntil > now) {
                    this.state.isLocked = true;
                    this.state.lockoutUntil = state.lockoutUntil;
                    this.updateLockoutUI();
                } else if (state.lockoutUntil && state.lockoutUntil <= now) {
                    // Limpiar bloqueo expirado
                    this.clearLockout();
                }
                
                this.state.attempts = state.attempts || 0;
                this.state.lastAttempt = state.lastAttempt || null;
            }
        } catch (error) {
            console.warn('Error al cargar estado de auth:', error);
            this.clearState();
        }
    }
    
    /**
     * Guardar estado en localStorage
     */
    saveState() {
        try {
            localStorage.setItem('ash_auth_state', JSON.stringify({
                attempts: this.state.attempts,
                lastAttempt: this.state.lastAttempt,
                isLocked: this.state.isLocked,
                lockoutUntil: this.state.lockoutUntil,
                timestamp: Date.now()
            }));
        } catch (error) {
            console.warn('Error al guardar estado de auth:', error);
        }
    }
    
    /**
     * Limpiar estado guardado
     */
    clearState() {
        localStorage.removeItem('ash_auth_state');
        this.state.attempts = 0;
        this.state.lastAttempt = null;
        this.state.isLocked = false;
        this.state.lockoutUntil = null;
    }
    
    /**
     * Verificar sesión existente
     */
    checkExistingSession() {
        const sessionData = this.getSession();
        
        if (sessionData) {
            const now = new Date();
            const expiration = new Date(sessionData.expiration);
            
            if (now < expiration) {
                // Sesión válida, redirigir
                this.redirectToWizard(sessionData.product);
                return true;
            } else {
                // Sesión expirada, limpiar
                this.clearSession();
                this.showNotification('Tu sesión ha expirado. Por favor ingresa nuevamente.', 'warning');
            }
        }
        
        return false;
    }
    
    /**
     * Configurar auto-logout por inactividad
     */
    setupAutoLogout() {
        let inactivityTimer;
        
        const resetTimer = () => {
            clearTimeout(inactivityTimer);
            // 60 minutos de inactividad
            inactivityTimer = setTimeout(() => {
                if (this.getSession()) {
                    this.clearSession();
                    this.showNotification('Sesión cerrada por inactividad', 'info');
                    window.location.href = 'index.html';
                }
            }, 60 * 60 * 1000);
        };
        
        // Eventos que resetearán el timer
        const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
        events.forEach(event => {
            document.addEventListener(event, resetTimer);
        });
        
        resetTimer(); // Iniciar timer
    }
    
    /**
     * Manejar envío del formulario
     */
    async handleSubmit(event) {
        event.preventDefault();
        
        // Verificar bloqueo
        if (this.state.isLocked) {
            this.showLockoutMessage();
            return;
        }
        
        // Obtener datos
        const clave = this.elements.claveInput.value.trim();
        const email = this.elements.emailInput ? this.elements.emailInput.value.trim() : '';
        
        // Validaciones
        const validation = this.validateInputs(clave, email);
        if (!validation.valid) {
            this.showError(validation.message);
            return;
        }
        
        // Mostrar loading
        this.showLoading(true);
        
        try {
            // Verificar clave con el servidor
            const response = await this.verifyClave(clave, email);
            
            if (response.success) {
                // Éxito: guardar sesión y redirigir
                this.handleSuccess(response, clave, email);
                
                // Limpiar intentos fallidos
                this.clearState();
                
            } else {
                // Error: manejar intento fallido
                this.handleFailedAttempt(response.message);
            }
            
        } catch (error) {
            // Error de red o servidor
            this.handleNetworkError(error);
        }
    }
    
    /**
     * Validar inputs del formulario
     */
    validateInputs(clave, email) {
        // Validar clave
        if (!clave || clave.length < 16) {
            return { valid: false, message: 'La clave debe tener al menos 16 caracteres' };
        }
        
        if (this.state.currentProduct === 'personas' && !clave.startsWith('ASH-P-')) {
            return { valid: false, message: 'Las claves para Personas deben comenzar con ASH-P-' };
        }
        
        if (this.state.currentProduct === 'empresas' && !clave.startsWith('ASH-E-')) {
            return { valid: false, message: 'Las claves para Empresas deben comenzar con ASH-E-' };
        }
        
        // Validar formato básico
        const claveRegex = /^ASH-[PE]-\w{4}-\w{4}-\w{4}$/;
        if (!claveRegex.test(clave)) {
            return { valid: false, message: 'Formato de clave inválido. Ejemplo: ASH-P-XXXX-XXXX-XXXX' };
        }
        
        // Validar email
        if (!email) {
            return { valid: false, message: 'El email es requerido' };
        }
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return { valid: false, message: 'Por favor ingresa un email válido' };
        }
        
        return { valid: true, message: '' };
    }
    
    /**
     * Verificar clave con el servidor
     */
    async verifyClave(clave, email) {
        // Mostrar estado de conexión
        this.showConnectionStatus();
        
        const response = await fetch(`${this.config.apiBase}verificar-clave.php`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({
                clave: clave,
                producto: this.state.currentProduct,
                email: email,
                timestamp: Date.now(),
                userAgent: navigator.userAgent,
                language: navigator.language
            }),
            signal: AbortSignal.timeout(30000) // Timeout de 30 segundos
        });
        
        if (!response.ok) {
            throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
    }
    
    /**
     * Manejar éxito en autenticación
     */
    handleSuccess(response, clave, email) {
        // Guardar sesión
        this.saveSession(
            response.token,
            clave,
            email,
            response.expiracion || response.valida_hasta
        );
        
        // Mostrar mensaje de éxito
        this.showSuccess();
        
        // Registrar evento
        this.logEvent('auth_success', {
            clave: clave,
            producto: this.state.currentProduct,
            email: email
        });
        
        // Redirigir después de 2 segundos
        setTimeout(() => {
            this.redirectToWizard(this.state.currentProduct);
        }, 2000);
    }
    
    /**
     * Manejar intento fallido
     */
    handleFailedAttempt(errorMessage) {
        // Incrementar contador de intentos
        this.state.attempts++;
        this.state.lastAttempt = Date.now();
        
        // Verificar si excede máximo de intentos
        if (this.state.attempts >= this.config.maxAttempts) {
            this.lockAccount();
            this.showLockoutMessage();
        } else {
            this.showError(`${errorMessage} (Intento ${this.state.attempts}/${this.config.maxAttempts})`);
        }
        
        // Guardar estado
        this.saveState();
        
        // Registrar evento
        this.logEvent('auth_failed', {
            attempts: this.state.attempts,
            error: errorMessage
        });
        
        // Restaurar UI
        this.showLoading(false);
    }
    
    /**
     * Manejar error de red
     */
    handleNetworkError(error) {
        console.error('Error de red:', error);
        
        let message = 'Error de conexión. ';
        
        if (!navigator.onLine) {
            message += 'Verifica tu conexión a internet.';
        } else if (error.name === 'AbortError') {
            message += 'La solicitud tardó demasiado tiempo.';
        } else {
            message += 'Por favor intenta nuevamente.';
        }
        
        this.showError(message);
        this.showLoading(false);
        
        // Registrar evento
        this.logEvent('network_error', {
            error: error.message,
            online: navigator.onLine
        });
    }
    
    /**
     * Bloquear cuenta temporalmente
     */
    lockAccount() {
        this.state.isLocked = true;
        this.state.lockoutUntil = Date.now() + this.config.lockoutTime;
        this.updateLockoutUI();
        this.saveState();
    }
    
    /**
     * Limpiar bloqueo
     */
    clearLockout() {
        this.state.isLocked = false;
        this.state.lockoutUntil = null;
        this.state.attempts = 0;
        this.updateLockoutUI();
        this.saveState();
    }
    
    /**
     * Actualizar UI para estado de bloqueo
     */
    updateLockoutUI() {
        if (this.state.isLocked && this.elements.submitBtn) {
            const remaining = Math.ceil((this.state.lockoutUntil - Date.now()) / 60000);
            this.elements.submitBtn.disabled = true;
            this.elements.submitBtn.innerHTML = `
                <span>Bloqueado (${remaining} min)</span>
                <i class="fas fa-lock"></i>
            `;
        }
    }
    
    /**
     * Mostrar mensaje de bloqueo
     */
    showLockoutMessage() {
        if (this.state.isLocked) {
            const remaining = Math.ceil((this.state.lockoutUntil - Date.now()) / 60000);
            this.showError(
                `Demasiados intentos fallidos. La cuenta está bloqueada por ${remaining} minutos.`
            );
        }
    }
    
    /**
     * Formatear input de clave en tiempo real
     */
    formatClaveInput(event) {
        const input = event.target;
        let value = input.value.trim().toUpperCase();
        
        // Remover caracteres no permitidos
        value = value.replace(/[^A-Z0-9-]/g, '');
        
        // Auto-insertar prefijo según producto
        if (this.state.currentProduct === 'personas' && !value.startsWith('ASH-P-')) {
            value = 'ASH-P-' + value.replace('ASH-P-', '');
        } else if (this.state.currentProduct === 'empresas' && !value.startsWith('ASH-E-')) {
            value = 'ASH-E-' + value.replace('ASH-E-', '');
        }
        
        // Formato automático con guiones
        if (value.length > 6) {
            const parts = [];
            const prefix = value.substring(0, 6); // ASH-P- o ASH-E-
            const rest = value.substring(6).replace(/-/g, '');
            
            parts.push(prefix);
            
            // Dividir en grupos de 4
            for (let i = 0; i < rest.length && i < 12; i += 4) {
                parts.push(rest.substring(i, i + 4));
            }
            
            value = parts.join('-');
        }
        
        input.value = value;
        
        // Validación visual
        this.validateClaveInput(value);
    }
    
    /**
     * Validación visual del input de clave
     */
    validateClaveInput(value) {
        if (!this.elements.claveInput) return;
        
        const isValid = this.validateInputs(value, 'test@test.com').valid;
        
        if (value.length > 0) {
            if (isValid) {
                this.elements.claveInput.classList.remove('error');
                this.elements.claveInput.classList.add('success');
            } else {
                this.elements.claveInput.classList.remove('success');
                this.elements.claveInput.classList.add('error');
            }
        } else {
            this.elements.claveInput.classList.remove('success', 'error');
        }
    }
    
    /**
     * Manejar evento keydown
     */
    handleKeydown(event) {
        // Atajos de teclado
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (this.elements.authForm) {
                this.elements.authForm.dispatchEvent(new Event('submit'));
            }
        }
        
        // Ctrl/Cmd + K para limpiar
        if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
            event.preventDefault();
            this.clearForm();
        }
    }
    
    /**
     * Manejar evento paste
     */
    handlePaste(event) {
        // Limpiar datos pegados
        setTimeout(() => {
            this.formatClaveInput({ target: this.elements.claveInput });
        }, 10);
    }
    
    /**
     * Alternar visibilidad de la clave
     */
    togglePasswordVisibility() {
        if (!this.elements.claveInput || !this.elements.toggleVisibility) return;
        
        const type = this.elements.claveInput.type;
        this.elements.claveInput.type = type === 'password' ? 'text' : 'password';
        
        this.elements.toggleVisibility.innerHTML = type === 'password' 
            ? '<i class="fas fa-eye-slash"></i>' 
            : '<i class="fas fa-eye"></i>';
        
        this.elements.toggleVisibility.title = type === 'password' 
            ? 'Ocultar clave' 
            : 'Mostrar clave';
    }
    
    /**
     * Mostrar/ocultar loading
     */
    showLoading(show) {
        if (!this.elements.submitBtn) return;
        
        if (show) {
            this.elements.submitBtn.disabled = true;
            this.elements.submitBtn.innerHTML = `
                <i class="fas fa-spinner fa-spin"></i>
                <span>Verificando...</span>
            `;
        } else {
            this.elements.submitBtn.disabled = false;
            this.elements.submitBtn.innerHTML = `
                <span>Verificar y Continuar</span>
                <i class="fas fa-arrow-right"></i>
            `;
        }
    }
    
    /**
     * Mostrar mensaje de error
     */
    showError(message) {
        // Mostrar en elemento específico si existe
        if (this.elements.errorMessage && this.elements.errorText) {
            this.elements.errorText.textContent = message;
            this.elements.errorMessage.style.display = 'flex';
            
            // Scroll suave al error
            this.elements.errorMessage.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
            });
            
            // Auto-ocultar después de 8 segundos
            setTimeout(() => {
                this.elements.errorMessage.style.display = 'none';
            }, 8000);
        } else {
            // Fallback: alert
            alert(`Error: ${message}`);
        }
        
        // Efecto de shake en el formulario
        if (this.elements.authForm) {
            this.elements.authForm.classList.add('shake');
            setTimeout(() => {
                this.elements.authForm.classList.remove('shake');
            }, 500);
        }
    }
    
    /**
     * Mostrar mensaje de éxito
     */
    showSuccess() {
        if (this.elements.successMessage) {
            this.elements.successMessage.style.display = 'flex';
            
            // Actualizar progress steps
            if (this.elements.progressSteps && this.elements.progressSteps.length > 1) {
                this.elements.progressSteps[0].classList.remove('active');
                this.elements.progressSteps[1].classList.add('active');
            }
        }
    }
    
    /**
     * Mostrar estado de conexión
     */
    showConnectionStatus() {
        if (!navigator.onLine) {
            this.showError('Sin conexión a internet. Conéctate para continuar.');
            return false;
        }
        return true;
    }
    
    /**
     * Manejar cambio a online
     */
    handleOnline() {
        this.showNotification('Conexión restablecida', 'success');
        this.clearState(); // Limpiar bloqueos por offline
    }
    
    /**
     * Manejar cambio a offline
     */
    handleOffline() {
        this.showNotification('Sin conexión a internet', 'warning');
        this.showLoading(false);
    }
    
    /**
     * Mostrar notificación flotante
     */
    showNotification(message, type = 'info') {
        // Crear elemento de notificación
        const notification = document.createElement('div');
        notification.className = `ash-notification ash-notification-${type}`;
        notification.innerHTML = `
            <div class="ash-notification-content">
                <i class="fas fa-${this.getNotificationIcon(type)}"></i>
                <span>${message}</span>
            </div>
            <button class="ash-notification-close">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        // Agregar estilos
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${this.getNotificationColor(type)};
            color: white;
            padding: 12px 16px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            gap: 12px;
            max-width: 400px;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            animation: slideInRight 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remover después de 5 segundos
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 5000);
        
        // Botón de cerrar
        notification.querySelector('.ash-notification-close').addEventListener('click', () => {
            notification.remove();
        });
    }
    
    getNotificationIcon(type) {
        const icons = {
            'success': 'check-circle',
            'error': 'exclamation-circle',
            'warning': 'exclamation-triangle',
            'info': 'info-circle'
        };
        return icons[type] || 'info-circle';
    }
    
    getNotificationColor(type) {
        const colors = {
            'success': '#198754',
            'error': '#dc3545',
            'warning': '#ffc107',
            'info': '#0dcaf0'
        };
        return colors[type] || '#0dcaf0';
    }
    
    /**
     * Guardar sesión
     */
    saveSession(token, clave, email, expiration) {
        const sessionData = {
            token: token,
            clave: clave,
            product: this.state.currentProduct,
            email: email,
            expiration: expiration || new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hora por defecto
            createdAt: new Date().toISOString(),
            userAgent: navigator.userAgent,
            ip: 'client' // En backend se obtiene la IP real
        };
        
        // Guardar en sessionStorage (sesión de navegador)
        sessionStorage.setItem(this.config.sessionKey, JSON.stringify(sessionData));
        
        // También en localStorage para persistencia entre pestañas
        localStorage.setItem(this.config.sessionKey, JSON.stringify({
            ...sessionData,
            persistent: true
        }));
        
        this.state.session = sessionData;
    }
    
    /**
     * Obtener sesión actual
     */
    getSession() {
        if (this.state.session) {
            return this.state.session;
        }
        
        try {
            const sessionData = sessionStorage.getItem(this.config.sessionKey) || 
                              localStorage.getItem(this.config.sessionKey);
            
            if (sessionData) {
                this.state.session = JSON.parse(sessionData);
                return this.state.session;
            }
        } catch (error) {
            console.warn('Error al leer sesión:', error);
        }
        
        return null;
    }
    
    /**
     * Limpiar sesión
     */
    clearSession() {
        sessionStorage.removeItem(this.config.sessionKey);
        localStorage.removeItem(this.config.sessionKey);
        this.state.session = null;
    }
    
    /**
     * Redirigir al wizard correspondiente
     */
    redirectToWizard(product) {
        const wizardPage = product === 'personas' ? 'wizard-personas.html' : 'wizard-empresas.html';
        
        // Agregar parámetros de sesión
        const session = this.getSession();
        if (session && session.token) {
            window.location.href = `${wizardPage}?token=${session.token}`;
        } else {
            window.location.href = wizardPage;
        }
    }
    
    /**
     * Limpiar formulario
     */
    clearForm() {
        if (this.elements.claveInput) this.elements.claveInput.value = '';
        if (this.elements.emailInput) this.elements.emailInput.value = '';
        if (this.elements.errorMessage) this.elements.errorMessage.style.display = 'none';
        if (this.elements.claveInput) this.elements.claveInput.focus();
    }
    
    /**
     * Registrar evento para analytics
     */
    logEvent(eventName, data = {}) {
        if (this.config.debug) {
            console.log(`[ASH Auth Event] ${eventName}:`, data);
        }
        
        // En producción, enviar a analytics
        const eventData = {
            event: eventName,
            timestamp: new Date().toISOString(),
            product: this.state.currentProduct,
            ...data
        };
        
        // Guardar en localStorage para batch processing
        try {
            const events = JSON.parse(localStorage.getItem('ash_analytics_events') || '[]');
            events.push(eventData);
            localStorage.setItem('ash_analytics_events', JSON.stringify(events.slice(-100))); // Mantener últimos 100 eventos
        } catch (error) {
            console.warn('Error al guardar evento analytics:', error);
        }
    }
    
    /**
     * Verificar si hay sesión activa (método estático)
     */
    static isAuthenticated() {
        try {
            const sessionData = sessionStorage.getItem('ash_session_v2') || 
                              localStorage.getItem('ash_session_v2');
            
            if (sessionData) {
                const session = JSON.parse(sessionData);
                const now = new Date();
                const expiration = new Date(session.expiration);
                
                return now < expiration;
            }
        } catch (error) {
            console.warn('Error al verificar autenticación:', error);
        }
        
        return false;
    }
    
    /**
     * Obtener producto actual (método estático)
     */
    static getCurrentProduct() {
        try {
            const sessionData = sessionStorage.getItem('ash_session_v2') || 
                              localStorage.getItem('ash_session_v2');
            
            if (sessionData) {
                const session = JSON.parse(sessionData);
                return session.product || 'personas';
            }
        } catch (error) {
            console.warn('Error al obtener producto:', error);
        }
        
        // Detectar por URL
        const path = window.location.pathname;
        if (path.includes('personas')) return 'personas';
        if (path.includes('empresas')) return 'empresas';
        
        return 'personas';
    }
    
    /**
     * Cerrar sesión (método estático)
     */
    static logout() {
        // Limpiar almacenamiento
        sessionStorage.removeItem('ash_session_v2');
        localStorage.removeItem('ash_session_v2');
        localStorage.removeItem('ash_auth_state');
        localStorage.removeItem('ash_wizard_personas');
        localStorage.removeItem('ash_wizard_empresas');
        
        // Redirigir al inicio
        window.location.href = 'index.html';
    }
    
    /**
     * Requerir autenticación (método estático para otras páginas)
     */
    static requireAuth() {
        if (!ASHAuth.isAuthenticated()) {
            const product = ASHAuth.getCurrentProduct();
            window.location.href = `auth-${product}.html`;
            return false;
        }
        return true;
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    // Verificar si estamos en una página de autenticación
    const isAuthPage = window.location.pathname.includes('auth-') || 
                      document.getElementById('authForm');
    
    if (isAuthPage) {
        // Inicializar sistema de autenticación
        window.ashAuth = new ASHAuth({
            debug: window.location.hostname === 'localhost' || 
                   window.location.hostname === '127.0.0.1'
        });
        
        // Agregar estilos CSS adicionales
        const styles = document.createElement('style');
        styles.textContent = `
            /* Animaciones */
            @keyframes shake {
                0%, 100% { transform: translateX(0); }
                10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
                20%, 40%, 60%, 80% { transform: translateX(5px); }
            }
            
            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            
            @keyframes slideOutRight {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }
            
            /* Estados de input */
            .form-input.success {
                border-color: #198754 !important;
                box-shadow: 0 0 0 3px rgba(25, 135, 84, 0.1) !important;
            }
            
            .form-input.error {
                border-color: #dc3545 !important;
                box-shadow: 0 0 0 3px rgba(220, 53, 69, 0.1) !important;
            }
            
            .shake {
                animation: shake 0.5s ease-in-out;
            }
            
            /* Progress steps */
            .progress-step.active .step-number {
                background: #1a1a1a !important;
                color: white !important;
                border-color: #1a1a1a !important;
            }
            
            .progress-step.active .step-label {
                color: #1a1a1a !important;
                font-weight: 500 !important;
            }
            
            /* Notificaciones */
            .ash-notification {
                font-family: 'Inter', sans-serif;
                font-size: 14px;
            }
            
            .ash-notification-content {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .ash-notification-close {
                background: none;
                border: none;
                color: rgba(255,255,255,0.7);
                cursor: pointer;
                padding: 4px;
                font-size: 14px;
                transition: color 0.2s;
            }
            
            .ash-notification-close:hover {
                color: white;
            }
            
            /* Responsive */
            @media (max-width: 768px) {
                .ash-notification {
                    left: 20px;
                    right: 20px;
                    max-width: none;
                }
            }
        `;
        document.head.appendChild(styles);
    }
    
    // En otras páginas, verificar autenticación automáticamente
    const protectedPages = ['wizard-personas.html', 'wizard-empresas.html', 
                          'results-personas.html', 'results-empresas.html'];
    
    const currentPage = window.location.pathname.split('/').pop();
    if (protectedPages.includes(currentPage)) {
        ASHAuth.requireAuth();
    }
});

// Exportar para uso en módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ASHAuth;
}