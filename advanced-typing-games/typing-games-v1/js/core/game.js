class Game {
    constructor(resourceManager, storage, scoreUI) {
        this.resourceManager = resourceManager;
        this.storage = storage;
        this.scoreUI = scoreUI;
        
        // Game state
        this.isActive = false;
        this.currentStage = 0;
        this.score = 0;
        this.timeLeft = 0;
        this.ready = false;
        this.cleanup = [];
        
        // Performance monitoring
        this.lastFrameTime = 0;
        this.frameCount = 0;
        this.fps = 0;
        
        // Mobile detection
        this.isMobile = 'ontouchstart' in window;
        
        // Initialize systems
        this.initSystems();
    }

    async initSystems() {
        try {
            // Initialize canvas
            this.canvas = document.getElementById('gameCanvas');
            if (!this.canvas) throw new Error('Canvas element not found');
            
            this.ctx = this.canvas.getContext('2d', { alpha: false }); // Optimize for non-transparent canvas
            if (!this.ctx) throw new Error('Could not get canvas context');

            // Initialize game components
            this.collisionSystem = new CollisionSystem();
            this.particleSystem = new ParticleSystem({
                maxParticles: 100,
                batchSize: 20
            });
            this.audioManager = new AudioManager(this.resourceManager);
            this.wordManager = new WordManager(this.resourceManager.getConfig('words'));
            this.stats = new Stats();
            
            // Initialize input system based on device
            this.inputManager = new InputManager(this.isMobile, this.handleInput.bind(this));
            
            // Set up event listeners with cleanup
            this.setupEventListeners();
            
            // Initialize display
            this.initDisplay();
            
            this.ready = true;
            return true;
        } catch (error) {
            console.error('Game initialization error:', error);
            this.handleError(error);
            return false;
        }
    }

    initDisplay() {
        // Use ResizeObserver for better performance than resize event
        const resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                this.resizeCanvas(width, height);
            }
        });

        resizeObserver.observe(this.canvas.parentElement);
        this.cleanup.push(() => resizeObserver.disconnect());

        // Initial resize
        this.resizeCanvas(
            this.canvas.parentElement.clientWidth,
            this.canvas.parentElement.clientHeight
        );
    }

    resizeCanvas(width, height) {
        // Handle device pixel ratio for sharp rendering
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        this.ctx.scale(dpr, dpr);
    }

    setupEventListeners() {
        // Word input handling
        const wordInput = document.getElementById('word-input-field');
        if (wordInput) {
            const inputHandler = (e) => this.handleWordInput(e);
            wordInput.addEventListener('input', inputHandler);
            this.cleanup.push(() => wordInput.removeEventListener('input', inputHandler));
        }

        // Visibility change handling for proper pause/resume
        const visibilityHandler = () => this.handleVisibilityChange();
        document.addEventListener('visibilitychange', visibilityHandler);
        this.cleanup.push(() => document.removeEventListener('visibilitychange', visibilityHandler));

        // Context menu prevention
        const contextHandler = (e) => e.preventDefault();
        this.canvas.addEventListener('contextmenu', contextHandler);
        this.cleanup.push(() => this.canvas.removeEventListener('contextmenu', contextHandler));
    }

    handleVisibilityChange() {
        if (document.hidden) {
            this.pause();
        } else {
            this.resume();
        }
    }

    pause() {
        if (this.isActive) {
            this.isActive = false;
            this.audioManager.pauseAll();
            cancelAnimationFrame(this.animationFrame);
        }
    }

    resume() {
        if (!this.isActive && this.ready) {
            this.isActive = true;
            this.lastFrameTime = performance.now();
            this.gameLoop();
        }
    }

    handleError(error) {
        this.isActive = false;
        this.ready = false;
        
        const errorMessage = document.createElement('div');
        errorMessage.className = 'game-error';
        errorMessage.innerHTML = `
            <div class="error-content">
                <h3>Game Error</h3>
                <p>${error.message}</p>
                <button onclick="location.reload()">Restart Game</button>
            </div>
        `;
        
        this.canvas.parentElement.appendChild(errorMessage);
    }

    start() {
        if (!this.ready) {
            console.error('Game not ready to start');
            return false;
        }

        try {
            // Reset game state
            this.isActive = true;
            this.score = 0;
            this.currentStage = 0;
            this.timeLeft = this.resourceManager.getConfig('game').settings.timeLimit;
            this.words = [];
            this.stats.reset();
            
            // Reset UI
            this.scoreUI.reset();
            this.scoreUI.updateScore(0);
            this.scoreUI.updateTimer(this.timeLeft);
            this.scoreUI.updateStage(1);
            
            // Start game systems
            this.loadStage(this.currentStage);
            this.lastFrameTime = performance.now();
            this.gameLoop();
            this.startTimer();
            
            return true;
        } catch (error) {
            console.error('Error starting game:', error);
            this.handleError(error);
            return false;
        }
    }
    gameLoop(timestamp = performance.now()) {
        if (!this.isActive) return;

        // Calculate delta time and FPS
        const deltaTime = timestamp - this.lastFrameTime;
        this.lastFrameTime = timestamp;
        
        this.frameCount++;
        if (timestamp > this.lastFpsUpdate + 1000) {
            this.fps = Math.round((this.frameCount * 1000) / (timestamp - this.lastFpsUpdate));
            this.frameCount = 0;
            this.lastFpsUpdate = timestamp;
        }

        // Update game state
        try {
            this.update(deltaTime / 1000); // Convert to seconds
            this.render();
        } catch (error) {
            console.error('Game loop error:', error);
            this.handleError(error);
            return;
        }

        // Request next frame
        this.animationFrame = requestAnimationFrame(time => this.gameLoop(time));
    }

    update(deltaTime) {
        // Update particles with delta time
        this.particleSystem.update(deltaTime);

        // Update words
        this.words.forEach(word => {
            word.update(deltaTime, this.canvas.width, this.canvas.height);
        });

        // Update player if not typing
        if (!this.currentWord) {
            this.updatePlayer(deltaTime);
        }

        // Check collisions
        this.checkCollisions();
    }

    render() {
        // Clear with background color instead of clearRect for better performance
        this.ctx.fillStyle = this.resourceManager.getConfig('theme').colors.background.gradient.start;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw background gradient
        this.drawBackground();

        // Batch render words
        this.renderWords();

        // Render player
        this.player.render(this.ctx);

        // Render particles
        this.particleSystem.render(this.ctx);

        // Debug info in development
        if (process.env.NODE_ENV === 'development') {
            this.renderDebugInfo();
        }
    }

    renderWords() {
        // Group words by font properties for batch rendering
        const wordsBatch = new Map();
        
        this.words.forEach(word => {
            const key = `${word.font}|${word.color}`;
            if (!wordsBatch.has(key)) {
                wordsBatch.set(key, []);
            }
            wordsBatch.get(key).push(word);
        });

        // Render each batch
        wordsBatch.forEach((words, key) => {
            const [font, color] = key.split('|');
            this.ctx.font = font;
            this.ctx.fillStyle = color;
            
            words.forEach(word => {
                word.render(this.ctx);
            });
        });
    }

    renderDebugInfo() {
        this.ctx.font = '12px monospace';
        this.ctx.fillStyle = 'white';
        this.ctx.fillText(`FPS: ${this.fps}`, 10, 20);
        this.ctx.fillText(`Particles: ${this.particleSystem.getCount()}`, 10, 35);
        this.ctx.fillText(`Words: ${this.words.length}`, 10, 50);
    }

    checkCollisions() {
        if (this.currentWord || !this.isActive) return;

        for (const word of this.words) {
            if (this.collisionSystem.checkCollision(this.player, word)) {
                this.handleWordCollision(word);
                break;
            }
        }
    }

    handleWordCollision(word) {
        this.currentWord = word;
        this.showWordInput(word);
        this.audioManager.play('collision');
        this.particleSystem.createEffect('collision', word.x, word.y);
    }

    handleWordInput(event) {
        if (!this.currentWord) return;

        const input = event.target;
        const inputWord = input.value.toLowerCase();
        const targetWord = this.currentWord.text.toLowerCase();

        // Play typing sound
        if (inputWord.length > 0) {
            this.audioManager.play('type', { volume: 0.2 });
        }

        // Visual feedback
        if (targetWord.startsWith(inputWord)) {
            input.classList.remove('error');
            input.classList.add('correct');
        } else {
            input.classList.remove('correct');
            input.classList.add('error');
            this.stats.recordWordAttempt(targetWord, 0, false);
        }

        // Check for complete match
        if (inputWord === targetWord) {
            this.handleCorrectWord(input);
        }
    }

    handleCorrectWord(input) {
        const timeElapsed = (performance.now() - this.typingStartTime) / 1000;
        const stageConfig = this.resourceManager.getConfig('stages')[this.currentStage];
        
        // Calculate points
        const points = this.calculatePoints(timeElapsed, this.currentWord.text.length, stageConfig);
        
        // Update stats
        this.stats.recordWordAttempt(this.currentWord.text, timeElapsed, true);
        this.score += points;
        
        // Visual and audio feedback
        this.audioManager.play(this.stats.currentCombo > 5 ? 'combo' : 'correct');
        this.particleSystem.createEffect(
            this.stats.currentCombo > 5 ? 'combo' : 'correct',
            this.currentWord.x,
            this.currentWord.y
        );
        
        // Update UI
        this.scoreUI.updateScore(this.score);
        this.scoreUI.showCombo(points, this.stats.currentCombo);
        
        // Reset input
        input.value = '';
        input.classList.remove('correct', 'error');
        this.hideWordInput();
        
        // Replace word
        this.replaceWord(this.currentWord);
        this.currentWord = null;
        
        // Check stage progress
        this.checkStageProgress();
    }

    cleanup() {
        // Stop game loop
        cancelAnimationFrame(this.animationFrame);
        
        // Clear intervals
        clearInterval(this.timer);
        
        // Stop audio
        this.audioManager.stopAll();
        
        // Clear particles
        this.particleSystem.clear();
        
        // Remove event listeners
        this.cleanup.forEach(cleanup => cleanup());
        this.cleanup = [];
        
        // Reset state
        this.isActive = false;
        this.ready = false;
    }

    destroy() {
        this.cleanup();
        
        // Remove canvas
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        
        // Clear references
        this.canvas = null;
        this.ctx = null;
        this.words = null;
        this.player = null;
    }
}