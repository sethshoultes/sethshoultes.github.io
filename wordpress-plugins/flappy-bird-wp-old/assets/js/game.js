// assets/js/game.js
// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    const containers = document.querySelectorAll('.flappy-bird-container');
    
    containers.forEach((container, index) => {
        if (container && !container.hasAttribute('data-initialized')) {
            try {
                const canvas = container.querySelector('canvas.game-canvas');
                if (!canvas) {
                    throw new Error('Canvas element not found');
                }

                const game = new FlappyBirdGame(canvas);
                container.setAttribute('data-initialized', 'true');
                
                // Setup controls
                const startButton = container.querySelector(`#startGame-${index + 1}`);
                const resetButton = container.querySelector(`#resetGame-${index + 1}`);
                
                if (startButton) {
                    startButton.addEventListener('click', () => {
                        if (!game.gameState.started) {
                            game.startGame();
                            startButton.textContent = 'Pause Game';
                        } else if (!game.gameState.over) {
                            game.togglePause();
                            startButton.textContent = game.gameState.paused ? 'Resume Game' : 'Pause Game';
                        }
                    });
                }

                if (resetButton) {
                    resetButton.addEventListener('click', () => {
                        game.resetGame();
                        if (startButton) startButton.textContent = 'Start Game';
                    });
                }
            } catch (error) {
                console.error(`Failed to initialize game instance ${index}:`, error);
                container.innerHTML = `
                    <div class="game-error">
                        <p>Failed to initialize game. Please refresh the page.</p>
                        <p>${error.message}</p>
                    </div>
                `;
            }
        }
    });
});

class FlappyBirdGame {
    constructor(canvas, isPreview = false) {
        if (!canvas) {
            throw new Error('No canvas provided for FlappyBirdGame');
        }

        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.isPreview = isPreview;
        this.initialized = false;

        // Initialize sound effects
        this.sounds = {
            jump: new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA="),
            score: new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA="),
            hit: new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=")
        };
        
        this.settings = window.flappyBirdSettings || this.getDefaultSettings();
        
        this.setupCanvas();
        this.init();
        this.setupEventListeners();
    }

    setupCanvas() {
        const scaleFactor = this.isPreview ? 0.5 : 1;
        this.canvas.width = this.settings.canvas_width * scaleFactor;
        this.canvas.height = this.settings.canvas_height * scaleFactor;
    }

    init() {
        this.gameState = {
            started: false,
            over: false,
            paused: false,
            score: 0,
            highScore: parseInt(localStorage.getItem('flappyBirdHighScore')) || 0
        };

        this.gameStats = {
            startTime: 0,
            duration: 0,
            pipesPassed: 0
        };

        this.resetGameObjects();
        this.lastTime = 0;
        this.initialized = true;
        
        requestAnimationFrame((timestamp) => this.gameLoop(timestamp));
    }

    setupEventListeners() {
        const handleKeydown = (event) => {
            if (event.code === 'Space') {
                event.preventDefault();
                if (!this.gameState.started) {
                    this.startGame();
                } else if (!this.gameState.over && !this.gameState.paused) {
                    this.bird.velocity = this.settings.jump_force;
                    this.sounds.jump.play().catch(() => {});
                } else if (this.gameState.over) {
                    this.resetGame();
                }
            } else if (event.code === 'Escape' && this.gameState.started && !this.gameState.over) {
                this.togglePause();
            }
        };

        const handleTouch = (event) => {
            event.preventDefault();
            if (!this.gameState.started) {
                this.startGame();
            } else if (!this.gameState.over && !this.gameState.paused) {
                this.bird.velocity = this.settings.jump_force;
                this.sounds.jump.play().catch(() => {});
            } else if (this.gameState.over) {
                this.resetGame();
            }
        };

        document.addEventListener('keydown', handleKeydown);
        this.canvas.addEventListener('touchstart', handleTouch);

        this.cleanupListeners = () => {
            document.removeEventListener('keydown', handleKeydown);
            this.canvas.removeEventListener('touchstart', handleTouch);
        };
    }

    togglePause() {
        if (this.gameState.started && !this.gameState.over) {
            this.gameState.paused = !this.gameState.paused;
        }
    }

    startGame() {
        if (this.gameState.started && !this.gameState.over) return;
        
        this.gameState.started = true;
        this.gameState.over = false;
        this.gameState.paused = false;
        this.gameState.score = 0;
        
        this.bird.y = this.canvas.height / 2;
        this.bird.velocity = 0;
        
        this.gameStats = {
            startTime: Date.now(),
            duration: 0,
            pipesPassed: 0
        };
        
        this.pipes = [];
        this.createInitialPipes();
    }

    update(deltaTime) {
        if (!this.gameState.started || this.gameState.over || this.gameState.paused) {
            return;
        }

        // Update bird
        this.bird.velocity += this.settings.gravity;
        this.bird.y += this.bird.velocity;

        // Keep bird within bounds
        if (this.bird.y - this.bird.radius < 0) {
            this.bird.y = this.bird.radius;
            this.bird.velocity = 0;
        }
        if (this.bird.y + this.bird.radius > this.canvas.height) {
            this.gameState.over = true;
        }

        this.updatePipes();
        this.checkCollisions();
    }

    updatePipes() {
        for (let i = this.pipes.length - 1; i >= 0; i--) {
            const pipe = this.pipes[i];
            
            pipe.x -= this.settings.base_speed * 
                (1 + Math.floor(this.gameState.score / this.settings.score_threshold) * 
                this.settings.speed_increment);

            if (!pipe.scored && pipe.x + pipe.width < this.bird.x) {
                this.gameState.score++;
                this.gameStats.pipesPassed++;
                pipe.scored = true;
                
                if (this.gameState.score > this.gameState.highScore) {
                    this.gameState.highScore = this.gameState.score;
                    localStorage.setItem('flappyBirdHighScore', this.gameState.highScore);
                }
            }

            if (pipe.x + pipe.width < 0) {
                this.pipes.splice(i, 1);
                this.addNewPipe();
            }
        }
    }

    checkCollisions() {
        for (const pipe of this.pipes) {
            if (this.bird.x + this.bird.radius > pipe.x && 
                this.bird.x - this.bird.radius < pipe.x + pipe.width) {
                
                if (this.bird.y - this.bird.radius < pipe.topHeight || 
                    this.bird.y + this.bird.radius > this.canvas.height - pipe.bottomHeight) {
                    this.gameState.over = true;
                    this.sounds.hit.play().catch(() => {});
                    return;
                }
            }
        }
    }

    draw() {
        // Clear canvas and set background
        this.ctx.fillStyle = this.settings.background_color;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw pipes
        this.ctx.fillStyle = this.settings.pipe_color;
        for (const pipe of this.pipes) {
            // Top pipe
            this.ctx.fillRect(pipe.x, 0, pipe.width, pipe.topHeight);
            // Bottom pipe
            this.ctx.fillRect(
                pipe.x, 
                this.canvas.height - pipe.bottomHeight, 
                pipe.width, 
                pipe.bottomHeight
            );
        }
        
        // Draw bird
        this.drawBird();
        
        // Draw score
        this.ctx.fillStyle = '#000';
        this.ctx.font = this.isPreview ? '16px Arial' : '24px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`Score: ${this.gameState.score}`, 10, 30);
        this.ctx.fillText(`High Score: ${this.gameState.highScore}`, 10, 60);
        
        if (this.gameState.over) {
            this.drawGameOverScreen();
        }
    }

    drawBird() {
        this.ctx.save();
        
        // Calculate rotation based on velocity
        const targetRotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, this.bird.velocity * 0.1));
        this.bird.rotation = this.bird.rotation || 0;
        this.bird.rotation += (targetRotation - this.bird.rotation) * 0.1;
        
        this.ctx.translate(this.bird.x, this.bird.y);
        this.ctx.rotate(this.bird.rotation);
        
        // Draw bird body
        this.ctx.fillStyle = this.settings.bird_color;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, this.bird.radius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Draw eye
        this.ctx.fillStyle = '#000';
        const eyeX = this.bird.radius * 0.3;
        const eyeY = -this.bird.radius * 0.2;
        const eyeRadius = this.bird.radius * 0.15;
        this.ctx.beginPath();
        this.ctx.arc(eyeX, eyeY, eyeRadius, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.restore();
    }

    drawGameOverScreen() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '30px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(
            'Game Over!', 
            this.canvas.width / 2, 
            this.canvas.height / 2
        );
        this.ctx.font = '20px Arial';
        this.ctx.fillText(
            'Press Space to Restart', 
            this.canvas.width / 2, 
            this.canvas.height / 2 + 40
        );
    }

    resetGame() {
        this.gameState = {
            started: false,
            over: false,
            paused: false,
            score: 0,
            highScore: parseInt(localStorage.getItem('flappyBirdHighScore')) || 0
        };
        
        this.resetGameObjects();
    }

    gameLoop(timestamp) {
        if (!this.initialized) return;
    
        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;
    
        // Always draw the current state
        this.draw();
    
        // Only update game state if not paused and not game over
        if (!this.gameState.paused && !this.gameState.over) {
            this.update(deltaTime);
        }
        
        requestAnimationFrame((timestamp) => this.gameLoop(timestamp));
    }
}

