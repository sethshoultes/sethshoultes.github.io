class FlappyBirdGame {
    constructor(container, isPreview = false) {
        if (!container) {
            console.error('Container element is required');
            return;
        }

        // Initialize with WordPress settings
        this.settings = window.flappyBirdSettings || this.getDefaultSettings();
        this.isPreview = isPreview;
        
        // Canvas setup
        this.canvas = document.createElement('canvas');
        container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        
        // Set canvas size
        this.canvas.width = isPreview ? this.settings.canvas_width / 2 : this.settings.canvas_width;
        this.canvas.height = isPreview ? this.settings.canvas_height / 2 : this.settings.canvas_height;
        
        // Game state
        this.gameStarted = false;
        this.gameOver = false;
        this.paused = false;
        this.score = 0;
        this.highScore = parseInt(localStorage.getItem('flappyBirdHighScore')) || 0;
        
        // Initialize game objects
        this.resetBird();
        this.pipes = [];
        this.createInitialPipes();
        
        // Bind methods
        this.handleInput = this.handleInput.bind(this);
        this.update = this.update.bind(this);
        this.draw = this.draw.bind(this);
        
        // Event listeners
        if (!isPreview) {
            this.setupEventListeners();
        }
        
        // Start game loop
        this.lastTime = 0;
        this.gameLoop();
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

    setupEventListeners() {
        document.addEventListener('keydown', this.handleInput);
        document.addEventListener('touchstart', this.handleInput);
        
        const startButton = document.getElementById('startGame');
        const resetButton = document.getElementById('resetGame');
        
        if (startButton) {
            startButton.addEventListener('click', () => this.startGame());
        }
        if (resetButton) {
            resetButton.addEventListener('click', () => this.resetGame());
        }
    }

    resetBird() {
        this.bird = {
            x: this.canvas.width * 0.2,
            y: this.canvas.height / 2,
            velocity: 0,
            radius: this.isPreview ? 7 : 15
        };
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

    startGame() {
        this.gameStarted = true;
        this.gameOver = false;
        this.score = 0;
        this.pipes = [];
        this.resetBird();
        this.createInitialPipes();
    }

    resetGame() {
        this.startGame();
    }

    handleInput(event) {
        if ((event.code === 'Space' || event.type === 'touchstart' || event.type === 'click') && !this.gameOver) {
            event.preventDefault();
            if (!this.gameStarted) {
                this.startGame();
            }
            this.bird.velocity = this.settings.jump_force;
        }
    }

    update(deltaTime) {
        if (!this.gameStarted || this.gameOver || this.paused) return;

        // Update bird
        this.bird.velocity += this.settings.gravity;
        this.bird.y += this.bird.velocity;

        // Update pipes
        for (let i = this.pipes.length - 1; i >= 0; i--) {
            const pipe = this.pipes[i];
            pipe.x -= this.settings.base_speed * (1 + Math.floor(this.score / this.settings.score_threshold) * this.settings.speed_increment);

            // Score points
            if (!pipe.scored && pipe.x + pipe.width < this.bird.x) {
                this.score++;
                pipe.scored = true;
                
                if (this.score > this.highScore) {
                    this.highScore = this.score;
                    localStorage.setItem('flappyBirdHighScore', this.highScore);
                }
            }

            // Remove off-screen pipes
            if (pipe.x + pipe.width < 0) {
                this.pipes.splice(i, 1);
            }
        }

        // Create new pipes
        if (this.pipes.length === 0 || this.pipes[this.pipes.length - 1].x < this.canvas.width - 200) {
            this.createInitialPipes();
        }

        // Check collisions
        this.checkCollisions();
    }

    checkCollisions() {
        // Check pipe collisions
        for (const pipe of this.pipes) {
            if (this.bird.x + this.bird.radius > pipe.x && 
                this.bird.x - this.bird.radius < pipe.x + pipe.width) {
                if (this.bird.y - this.bird.radius < pipe.topHeight || 
                    this.bird.y + this.bird.radius > this.canvas.height - pipe.bottomHeight) {
                    this.gameOver = true;
                }
            }
        }

        // Check boundary collisions
        if (this.bird.y + this.bird.radius > this.canvas.height || 
            this.bird.y - this.bird.radius < 0) {
            this.gameOver = true;
        }
    }

    draw() {
        // Clear canvas
        this.ctx.fillStyle = this.settings.background_color;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw pipes
        this.ctx.fillStyle = this.settings.pipe_color;
        for (const pipe of this.pipes) {
            // Top pipe
            this.ctx.fillRect(pipe.x, 0, pipe.width, pipe.topHeight);
            // Bottom pipe
            this.ctx.fillRect(pipe.x, this.canvas.height - pipe.bottomHeight, 
                            pipe.width, pipe.bottomHeight);
        }

        // Draw bird
        this.ctx.fillStyle = this.settings.bird_color;
        this.ctx.beginPath();
        this.ctx.arc(this.bird.x, this.bird.y, this.bird.radius, 0, Math.PI * 2);
        this.ctx.fill();

        // Draw score
        if (!this.isPreview) {
            this.ctx.fillStyle = '#000';
            this.ctx.font = '24px Arial';
            this.ctx.fillText(`Score: ${this.score}`, 10, 30);
            this.ctx.fillText(`High Score: ${this.highScore}`, 10, 60);

            // Update score display
            const currentScoreElement = document.getElementById('currentScore');
            const highScoreElement = document.getElementById('highScore');
            if (currentScoreElement) currentScoreElement.textContent = this.score;
            if (highScoreElement) highScoreElement.textContent = this.highScore;
        }

        // Draw game over
        if (this.gameOver && !this.isPreview) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '48px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('Game Over!', this.canvas.width / 2, this.canvas.height / 2);
            this.ctx.font = '24px Arial';
            this.ctx.fillText('Press Space to Restart', this.canvas.width / 2, 
                            this.canvas.height / 2 + 40);
            this.ctx.textAlign = 'left';
        }
    }

    gameLoop(timestamp) {
        const deltaTime = timestamp - (this.lastTime || timestamp);
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