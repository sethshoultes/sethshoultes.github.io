document.addEventListener('DOMContentLoaded', function() {
    const gameContainer = document.querySelector('.flappy-bird-game');
    if (!gameContainer) return;

    const gameScreen = document.getElementById('game-screen');
    const bird = document.getElementById('bird');
    const scoreDisplay = document.getElementById('score');
    const startMessage = document.getElementById('start-message');
    const gameOverScreen = document.getElementById('game-over');
    const finalScore = document.getElementById('final-score');
    const highScore = document.getElementById('high-score');
    const restartButton = document.getElementById('restart-button');
    const isTouchDevice = 'ontouchstart' in window;

    if (isTouchDevice) {
        initTouchControls();
    }
    
    let gameLoop;
    let birdY = 250;
    let velocity = 0;
    let pipes = [];
    let score = 0;
    let isGameRunning = false;
    let isPaused = false;
    
    const settings = {
        baseSpeed: 2,
        speedIncrement: 0.1,
        baseGap: 160,        
        gapDecrement: 2,     
        minGap: 120,         
        gravity: parseFloat(flappyBirdSettings.gravity) || 0.5,
        jump: parseFloat(flappyBirdSettings.jump_force) || -7,
        pipeSpeed: parseFloat(flappyBirdSettings.pipe_speed) || 3,
        pipeSpawnInterval: 1000,
        minPipeGap: 120,
        pipeGap: parseInt(flappyBirdSettings.pipe_gap) || 150,
        maxPipes: 3

    };

   

    function initializeGameElements() {
        gameScreen = document.getElementById('game-screen');
        bird = document.getElementById('bird');
        scoreDisplay = document.getElementById('score');
        startMessage = document.getElementById('start-message');
        gameOverScreen = document.getElementById('game-over');
        finalScore = document.getElementById('final-score');
        highScore = document.getElementById('high-score');
        restartButton = document.getElementById('restart-button');

        if (!gameScreen || !bird) {
            console.error('Required game elements not found');
            return false;
        }
        return true;
    }

    function initGame() {
        try {
            // Initialize game components
            if (!gameScreen || !bird) {
                throw new Error('Required game elements not found');
            }
            
            // Initialize game
            setupGame();
        } catch (error) {
            console.error('Game initialization failed:', error);
            showErrorMessage('Failed to load game. Please refresh the page.');
        }
    }
    
    function updateGame() {
        if (!isGameRunning) return;

        // Update bird position
        velocity += settings.gravity;
        birdY += velocity;
        bird.style.top = birdY + 'px';

        // Update pipes
        updatePipes();

        // Check collisions
        if (checkCollisions()) {
            endGame();
        }
    }

    function createPipe() {
        if (!isGameRunning) return;
        
        // Check if we already have maximum pipes
        if (pipes.length >= settings.maxPipes) {
            return;
        }
    
        const pipeHeight = Math.random() * (gameScreen.clientHeight - settings.pipeGap - 100) + 50;
        
        const topPipe = document.createElement('div');
        const bottomPipe = document.createElement('div');
        
        topPipe.className = 'pipe';
        bottomPipe.className = 'pipe';
        
        topPipe.style.height = pipeHeight + 'px';
        topPipe.style.top = '0';
        topPipe.style.right = '-60px';
        
        bottomPipe.style.height = (gameScreen.clientHeight - pipeHeight - settings.pipeGap) + 'px';
        bottomPipe.style.bottom = '0';
        bottomPipe.style.right = '-60px';
        
        gameScreen.appendChild(topPipe);
        gameScreen.appendChild(bottomPipe);
        
        pipes.push({
            top: topPipe,
            bottom: bottomPipe,
            passed: false
        });
    
        // Only schedule next pipe if we're below max pipes
        if (pipes.length < settings.maxPipes) {
            setTimeout(() => createPipe(), settings.pipeSpawnInterval);
        }
    }
    
    function updatePipes() {
        for (let i = pipes.length - 1; i >= 0; i--) {
            const pipe = pipes[i];
            const currentPosition = parseInt(pipe.top.style.right);
            const newPosition = currentPosition + settings.pipeSpeed;
            
            pipe.top.style.right = `${newPosition}px`;
            pipe.bottom.style.right = `${newPosition}px`;
    
            // Score point when passing pipe
            if (!pipe.passed && newPosition > gameScreen.clientWidth / 2) {
                pipe.passed = true;
                score++;
                scoreDisplay.textContent = score;
            }
    
            // Remove pipes that are off screen
            if (newPosition > gameScreen.clientWidth + 100) {
                gameScreen.removeChild(pipe.top);
                gameScreen.removeChild(pipe.bottom);
                pipes.splice(i, 1);
                
                // Create new pipe if we're below max pipes
                if (pipes.length < settings.maxPipes) {
                    setTimeout(() => createPipe(), 0);
                }
            }
        }
    }
    
    // Modify the startGame function to ensure proper cleanup
    function startGame() {
        if (isGameRunning) return;
        
        // Reset game state
        birdY = 250;
        velocity = 0;
        score = 0;
        
        // Clear existing pipes
        pipes.forEach(pipe => {
            gameScreen.removeChild(pipe.top);
            gameScreen.removeChild(pipe.bottom);
        });
        pipes = [];
        
        scoreDisplay.textContent = '0';
        startMessage.style.display = 'none';
        gameOverScreen.style.display = 'none';
        
        isGameRunning = true;
        gameLoop = setInterval(updateGame, 20);
        
        // Start with first pipe
        setTimeout(() => createPipe(), 1000);
    }

    function togglePause() {
        isPaused = !isPaused;
        if (isPaused) {
            clearInterval(gameLoop);
            showPauseScreen();
        } else {
            gameLoop = setInterval(updateGame, 20);
            hidePauseScreen();
        }
    }

    function checkCollisions() {
        const birdRect = bird.getBoundingClientRect();
        
        // Check wall collisions
        if (birdY < 0 || birdY > gameScreen.clientHeight - bird.clientHeight) {
            return true;
        }

        // Check pipe collisions
        return pipes.some(pipe => {
            const topPipeRect = pipe.top.getBoundingClientRect();
            const bottomPipeRect = pipe.bottom.getBoundingClientRect();

            return (
                birdRect.right > topPipeRect.left &&
                birdRect.left < topPipeRect.right && (
                    birdRect.top < topPipeRect.bottom ||
                    birdRect.bottom > bottomPipeRect.top
                )
            );
        });
    }

    function jump() {
        if (!isGameRunning) {
            startGame();
        } else {
            velocity = settings.jump;
        }
    }

    function endGame() {
        isGameRunning = false;
        clearInterval(gameLoop);
        
        // Update high score
        const currentHighScore = localStorage.getItem('flappyHighScore') || 0;
        if (score > currentHighScore) {
            localStorage.setItem('flappyHighScore', score);
        }
        
        // Show game over screen
        finalScore.textContent = score;
        highScore.textContent = Math.max(currentHighScore, score);
        gameOverScreen.style.display = 'block';
    }

    // Event Listeners
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            e.preventDefault();
            jump();
        }
        if (e.code === 'Escape') {
            togglePause();
        }
    });

    gameScreen.addEventListener('click', (e) => {
        e.preventDefault();
        jump();
    });

    function initTouchControls() {
        gameScreen.addEventListener('touchstart', (e) => {
            e.preventDefault();
            jump();
        });
    }
    function showErrorMessage(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'game-error';
        errorDiv.textContent = message;
        gameContainer.appendChild(errorDiv);
    }
    
    function showLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.style.display = 'block';
        }
    }
    
    function hideLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }
        gameScreen.style.display = 'block';
    }

    restartButton.addEventListener('click', startGame);

    class Sprite {
        constructor(element, frameWidth, frameHeight, frames) {
            this.element = element;
            this.frameWidth = frameWidth;
            this.frameHeight = frameHeight;
            this.frames = frames;
            this.currentFrame = 0;
        }

        animate() {
            this.currentFrame = (this.currentFrame + 1) % this.frames;
            this.element.style.backgroundPosition = 
                `-${this.currentFrame * this.frameWidth}px 0px`;
        }
    }

    // Initialize game only if elements are found
    if (initializeGameElements()) {
        const birdSprite = new Sprite(bird, 34, 24, 3);
        // Rest of your game code...
    }
});

// Initialize bird sprite
const birdSprite = new Sprite(bird, 34, 24, 3);