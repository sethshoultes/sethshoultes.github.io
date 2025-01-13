document.addEventListener('DOMContentLoaded', function() {
    const gameScreen = document.getElementById('game-screen');
    const bird = document.getElementById('bird');
    const scoreDisplay = document.getElementById('score');
    const startMessage = document.getElementById('start-message');
    const gameOverScreen = document.getElementById('game-over');
    const finalScore = document.getElementById('final-score');
    const highScore = document.getElementById('high-score');
    const restartButton = document.getElementById('restart-button');

    let gameLoop;
    let birdY = 250;
    let velocity = 0;
    let pipes = [];
    let score = 0;
    let isGameRunning = false;
    
    const settings = {
        gravity: 0.5,
        jump: -7,
        pipeSpeed: 3,
        pipeSpawnInterval: 1000,
        minPipeGap: 180,
        pipeGap: 150,
        maxPipes: 3
    };


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
    });

    gameScreen.addEventListener('click', (e) => {
        e.preventDefault();
        jump();
    });

    restartButton.addEventListener('click', startGame);
});