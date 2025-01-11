class Game {
    constructor(config, storage, scoreUI) {
        this.config = config;
        this.storage = storage;
        this.scoreUI = scoreUI;
        
        // Game state
        this.isActive = false;
        this.currentStage = 0;
        this.score = 0;
        this.timeLeft = 0;
        
        // Game elements
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.words = [];
        this.currentWord = null;
        this.player = null;
        
        // Initialize
        this.initCanvas();
        this.initPlayer();
        this.bindEvents();

        //Collision detection
        this.collisionSystem = new CollisionSystem();
        this.scoringSystem = new ScoringSystem(config);
        
        // Add combo display
        this.comboDisplay = null;
        this.comboTimeout = null;

        this.audioManager = new AudioManager();
        this.particleSystem = new ParticleSystem();
    }

    checkCollisions() {
        if (this.currentWord || !this.isActive) return;

        for (const word of this.words) {
            if (this.collisionSystem.checkCollision(this.player, word)) {
                this.currentWord = word;
                this.showWordInput(word);
                
                // Add collision effects
                this.audioManager.play('collision');
                this.particleSystem.createEffect('collision', word.x, word.y);
                break;
            }
        }
    }

    updatePlayer() {
        // Update position based on movement
        if (this.movement.w) this.player.y -= this.player.speed;
        if (this.movement.s) this.player.y += this.player.speed;
        if (this.movement.a) this.player.x -= this.player.speed;
        if (this.movement.d) this.player.x += this.player.speed;

        // Check and resolve boundary collisions
        const boundary = this.collisionSystem.checkBoundaryCollision(
            this.player, 
            this.canvas
        );
        this.collisionSystem.resolveCollision(this.player, boundary, this.canvas);
    }

    checkWord() {
        if (!this.currentWord) return;

        const input = document.getElementById('word-input-field');
        const inputWord = input.value.toLowerCase();
        const targetWord = this.currentWord.text.toLowerCase();

      // Play typing sound
      if (inputWord.length > 0) {
        this.audioManager.play('type');
    }

    // Check for partial match
    if (targetWord.startsWith(inputWord)) {
        input.style.backgroundColor = 'rgba(0, 255, 0, 0.1)';
    } else {
        input.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
        this.scoringSystem.registerMiss();
    }

    // Check for complete match
    if (inputWord === targetWord) {
        const timeElapsed = (Date.now() - this.typingStartTime) / 1000;
        const stageConfig = Object.values(this.config.stages)[this.currentStage];
        
        // Calculate score and create effects
        const points = this.scoringSystem.registerHit(
            timeElapsed,
            targetWord.length,
            stageConfig.settings.pointsMultiplier
        );

        // Play sound based on combo
        if (this.scoringSystem.combo > 5) {
            this.audioManager.play('combo');
        } else {
            this.audioManager.play('correct');
        }

        // Create particles
        const effect = this.scoringSystem.combo > 5 ? 'combo' : 'correct';
        this.particleSystem.createEffect(effect, this.currentWord.x, this.currentWord.y);

        // Update score and show combo
        this.score += points;
        this.scoreUI.updateScore(this.score);
        this.showCombo(points);

            // Remove word and add new one
            this.words = this.words.filter(w => w !== this.currentWord);
            this.words.push(this.wordManager.createWord(
                this.canvas.width,
                this.canvas.height,
                stageConfig.settings.wordSpeed
            ));

            // Reset input
            this.currentWord = null;
            input.value = '';
            input.style.backgroundColor = '';
            document.getElementById('word-input').classList.add('hidden');

            // Check for stage completion
            this.checkStageProgress();
        }
    }

    showCombo(points) {
        // Clear existing combo timeout
        if (this.comboTimeout) {
            clearTimeout(this.comboTimeout);
        }

        // Create or update combo display
        if (!this.comboDisplay) {
            this.comboDisplay = document.createElement('div');
            this.comboDisplay.className = 'combo-display';
            document.getElementById('game-container').appendChild(this.comboDisplay);
        }

        // Update combo text
        const combo = this.scoringSystem.combo;
        this.comboDisplay.innerHTML = `
            <div class="points">+${points}</div>
            ${combo > 1 ? `<div class="combo">Combo x${combo}!</div>` : ''}
        `;
        this.comboDisplay.style.opacity = '1';
        this.comboDisplay.style.transform = 'translateY(0)';

        // Fade out combo display
        this.comboTimeout = setTimeout(() => {
            this.comboDisplay.style.opacity = '0';
            this.comboDisplay.style.transform = 'translateY(-20px)';
        }, 1000);
    }

    checkStageProgress() {
        const currentStageConfig = Object.values(this.config.stages)[this.currentStage];
        const accuracy = this.scoringSystem.getAccuracy();

        if (this.score >= currentStageConfig.requirements.scoreToAdvance &&
            accuracy >= currentStageConfig.requirements.minAccuracy) {
            if (!this.loadStage(this.currentStage + 1)) {
                this.endGame(); // No more stages
            }
        }
    }

    endGame() {
        this.isActive = false;
        this.audioManager.play('gameOver');

        clearInterval(this.timer);
        
        // Get final stats
        const stats = this.scoringSystem.getStats();
        
        // Save score and stats
        if (this.config.game.settings.highScoreEnabled) {
            this.storage.saveHighScore(this.config.game.id, {
                score: this.score,
                stats: stats,
                maxStage: this.currentStage + 1
            });
        }

        // Show game over screen with stats
        const gameOver = document.getElementById('game-over');
        gameOver.querySelector('#final-score').textContent = this.score;
        gameOver.querySelector('.stats').innerHTML = `
            <div>Accuracy: ${stats.accuracy.toFixed(1)}%</div>
            <div>Max Combo: ${stats.maxCombo}</div>
            <div>Words Typed: ${stats.hits}</div>
            <div>Mistakes: ${stats.misses}</div>
        `;
        gameOver.classList.remove('hidden');
    }

    initCanvas() {
        const resize = () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        };
        resize();
        window.addEventListener('resize', resize);
    }

    initPlayer() {
        const theme = this.config.theme;
        this.player = new Sprite({
            type: theme.sprites.player.type,
            size: theme.sprites.player.size,
            color: theme.colors.sprite,
            x: this.canvas.width / 2,
            y: this.canvas.height / 2,
            speed: 5
        });
    }

    bindEvents() {
        // Movement controls
        this.movement = { w: false, a: false, s: false, d: false };
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));
        
        // Word input
        const wordInput = document.getElementById('word-input-field');
        wordInput.addEventListener('input', () => this.checkWord());
    }

    start() {
        this.isActive = true;
        this.score = 0;
        this.currentStage = 0;
        this.timeLeft = this.config.game.settings.timeLimit;
        
        // Reset UI
        this.scoreUI.updateScore(0);
        this.scoreUI.updateTimer(this.timeLeft);
        this.scoreUI.updateStage(1);
        
        // Load first stage
        this.loadStage(this.currentStage);
        
        // Start game loop
        this.gameLoop();
        
        // Start timer
        this.startTimer();
    }

    loadStage(stageIndex) {
        const stageConfig = Object.values(this.config.stages)[stageIndex];
        if (!stageConfig) return false;

        this.currentStage = stageIndex;
        this.words = [];
        
        // Create words for this stage
        const wordManager = new WordManager(this.config.words);
        for (let i = 0; i < stageConfig.settings.wordCount; i++) {
            this.words.push(wordManager.createWord(
                this.canvas.width,
                this.canvas.height,
                stageConfig.settings.wordSpeed
            ));
        }

        this.scoreUI.updateStage(stageIndex + 1);
        return true;
    }

    startTimer() {
        this.timer = setInterval(() => {
            this.timeLeft--;
            this.scoreUI.updateTimer(this.timeLeft);
            
            if (this.timeLeft <= 0) {
                this.endGame();
            }
        }, 1000);
    }

    gameLoop() {
        if (!this.isActive) return;

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw background
        this.drawBackground();

        // Update and draw words
        this.updateWords();

        // Update and draw player
        if (!this.currentWord) {
            this.updatePlayer();
        }
        this.player.draw(this.ctx);

        // Continue game loop
        requestAnimationFrame(() => this.gameLoop());
    }

    drawBackground() {
        const gradient = this.ctx.createLinearGradient(0, 0, this.canvas.width, this.canvas.height);
        gradient.addColorStop(0, this.config.theme.colors.background.gradient.start);
        gradient.addColorStop(1, this.config.theme.colors.background.gradient.end);
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    updateWords() {
        this.words.forEach(word => {
            word.update(this.canvas.width, this.canvas.height);
            word.draw(this.ctx);

            if (!this.currentWord && this.player.collidesWith(word)) {
                this.currentWord = word;
                this.showWordInput(word);
            }
        });
    }

    updatePlayer() {
        if (this.movement.w) this.player.y -= this.player.speed;
        if (this.movement.s) this.player.y += this.player.speed;
        if (this.movement.a) this.player.x -= this.player.speed;
        if (this.movement.d) this.player.x += this.player.speed;

        // Keep player in bounds
        this.player.x = Math.max(this.player.size, Math.min(this.canvas.width - this.player.size, this.player.x));
        this.player.y = Math.max(this.player.size, Math.min(this.canvas.height - this.player.size, this.player.y));
    }

    showWordInput(word) {
        const input = document.getElementById('word-input');
        const inputField = document.getElementById('word-input-field');
        input.classList.remove('hidden');
        inputField.value = '';
        inputField.focus();
        this.typingStartTime = Date.now();
    }

    // Removed duplicate checkWord method

    handleKeyDown(e) {
        if (!this.isActive || this.currentWord) return;
        const key = e.key.toLowerCase();
        if (key in this.movement) {
            this.movement[key] = true;
        }
    }

    handleKeyUp(e) {
        const key = e.key.toLowerCase();
        if (key in this.movement) {
            this.movement[key] = false;
        }
    }

   
}