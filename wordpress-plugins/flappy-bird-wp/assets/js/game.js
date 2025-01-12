class FlappyBirdGame {
    constructor(container, isPreview = false) {
        if (!container) {
            console.error('Container element is required');
            return;
        }

        this.container = container;
        this.isPreview = isPreview;
        this.initialized = false;
        this.settings = window.flappyBirdSettings || this.getDefaultSettings();
        
        this.gameState = {
            started: false,
            over: false,
            paused: false,
            score: 0,
            highScore: parseInt(localStorage.getItem('flappyBirdHighScore')) || 0
        };

        this.init();
    }

    getDefaultSettings() {
        return {
            bird_color: '#FFE338',
            pipe_color: '#2ecc71',
            background_color: '#70c5ce',
            canvas_width: 480,
            canvas_height: 640,
            base_speed: 2,
            speed_increment: 0.1,
            base_gap: 160,
            gap_decrement: 1,
            min_gap: 120,
            score_threshold: 5,
            gravity: 0.39,
            jump_force: -7
        };
    }

    init() {
        this.setupCanvas();
        this.resetGameObjects();
        
        if (!this.isPreview) {
            this.setupEventListeners();
        } else {
            this.setupPreviewMode();
        }

        this.lastTime = 0;
        this.initialized = true;
        this.gameLoop(0);
    }

    setupCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.isPreview ? 
            this.settings.canvas_width / 2 : 
            this.settings.canvas_width;
        this.canvas.height = this.isPreview ? 
            this.settings.canvas_height / 2 : 
            this.settings.canvas_height;
        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
    }

    setupPreviewMode() {
        this.gameState.started = true;
        this.createInitialPipes();
    }

    setupEventListeners() {
        this.handleInput = this.handleInput.bind(this);
        this.gameLoop = this.gameLoop.bind(this);

        document.addEventListener('keydown', this.handleInput);
        document.addEventListener('touchstart', this.handleInput);

        const startButton = document.getElementById('startGame');
        const resetButton = document.getElementById('resetGame');

        if (startButton) {
            startButton.addEventListener('click', () => this.toggleGame());
        }
        if (resetButton) {
            resetButton.addEventListener('click', () => this.resetGame());
        }
    }

    handleInput(event) {
        if ((event.code === 'Space' || event.type === 'touchstart') && 
            !this.gameState.over && !this.gameState.paused) {
            event.preventDefault();
            if (!this.gameState.started) {
                this.startGame();
            }
            this.bird.velocity = this.settings.jump_force;
        }
    }

    resetGameObjects() {
        this.bird = {
            x: this.canvas.width * 0.2,
            y: this.canvas.height / 2,
            velocity: 0,
            radius: this.isPreview ? 7 : 15
        };

        this.pipes = [];
        if (this.gameState.started) {
            this.createInitialPipes();
        }
    }

    createInitialPipes() {
        const pipeWidth = this.isPreview ? 25 : 50;
        const gap = this.settings.base_gap;
        const minHeight = 50;
        const maxHeight = this.canvas.height - gap - minHeight;
        const topHeight = Math.random() * (maxHeight - minHeight) + minHeight;

        this.pipes.push({
            x: this.canvas.width,
            topHeight: topHeight,
            bottomHeight: this.canvas.height - topHeight - gap,
            width: pipeWidth,
            scored: false
        });
    }

    toggleGame() {
        if (!this.gameState.started) {
            this.startGame();
        } else {
            this.gameState.paused = !this.gameState.paused;
        }
    }

    startGame() {
        this.gameState.started = true;
        this.gameState.over = false;
        this.gameState.paused = false;
        this.gameState.score = 0;
        this.resetGameObjects();
        this.createInitialPipes();
    }

    resetGame() {
        this.startGame();
    }

    update(deltaTime) {
        if (!this.gameState.started || this.gameState.over || this.gameState.paused) {
            return;
        }

        // Update bird
        this.bird.velocity += this.settings.gravity;
        this.bird.y += this.bird.velocity;

        // Update pipes
        for (let i = this.pipes.length - 1; i >= 0; i--) {
            const pipe = this.pipes[i];
            pipe.x -= this.settings.base_speed * 
                (1 + Math.floor(this.gameState.score / this.settings.score_threshold) * 
                this.settings.speed_increment);

            if (!pipe.scored && pipe.x + pipe.width < this.bird.x) {
                this.gameState.score++;
                pipe.scored = true;

                if (this.gameState.score > this.gameState.highScore) {
                    this.gameState.highScore = this.gameState.score;
                    localStorage.setItem('flappyBirdHighScore', this.gameState.highScore);
                }
            }

            if (pipe.x + pipe.width < 0) {
                this.pipes.splice(i, 1);
            }
        }

        // Create new pipes
        if (this.pipes.length === 0 || 
            this.pipes[this.pipes.length - 1].x < this.canvas.width - 200) {
            this.createInitialPipes();
        }

        this.checkCollisions();
    }

    checkCollisions() {
        // Check pipe collisions
        for (const pipe of this.pipes) {
            if (this.bird.x + this.bird.radius > pipe.x && 
                this.bird.x - this.bird.radius < pipe.x + pipe.width) {
                if (this.bird.y - this.bird.radius < pipe.topHeight || 
                    this.bird.y + this.bird.radius > this.canvas.height - pipe.bottomHeight) {
                    this.gameState.over = true;
                }
            }
        }

        // Check boundary collisions
        if (this.bird.y + this.bird.radius > this.canvas.height || 
            this.bird.y - this.bird.radius < 0) {
            this.gameState.over = true;
        }
    }

    draw() {
        // Clear canvas
        this.ctx.fillStyle = this.settings.background_color;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw pipes
        this.ctx.fillStyle = this.settings.pipe_color;
        for (const pipe of this.pipes) {
            this.ctx.fillRect(pipe.x, 0, pipe.width, pipe.topHeight);
            this.ctx.fillRect(
                pipe.x, 
                this.canvas.height - pipe.bottomHeight, 
                pipe.width, 
                pipe.bottomHeight
            );
        }

        // Draw bird
        this.ctx.fillStyle = this.settings.bird_color;
        this.ctx.beginPath();
        this.ctx.arc(this.bird.x, this.bird.y, this.bird.radius, 0, Math.PI * 2);
        this.ctx.fill();

        if (!this.isPreview) {
            this.drawUI();
        }
    }

    drawUI() {
        // Update score display
        const currentScoreElement = document.getElementById('currentScore');
        const highScoreElement = document.getElementById('highScore');
        if (currentScoreElement) {
            currentScoreElement.textContent = this.gameState.score;
        }
        if (highScoreElement) {
            highScoreElement.textContent = this.gameState.highScore;
        }

        // Draw game over screen
        if (this.gameState.over) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '48px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(
                'Game Over!', 
                this.canvas.width / 2, 
                this.canvas.height / 2
            );
            this.ctx.font = '24px Arial';
            this.ctx.fillText(
                'Press Space to Restart', 
                this.canvas.width / 2, 
                this.canvas.height / 2 + 40
            );
        }

        // Draw pause screen
        if (this.gameState.paused) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '48px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(
                'Paused', 
                this.canvas.width / 2, 
                this.canvas.height / 2
            );
        }
    }

    gameLoop(timestamp) {
        if (!this.initialized) return;

        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;

        this.update(deltaTime);
        this.draw();

        requestAnimationFrame((timestamp) => this.gameLoop(timestamp));
    }
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    const container = document.getElementById('gameCanvas');
    if (container) {
        window.flappyBirdGame = new FlappyBirdGame(container);
    }
});