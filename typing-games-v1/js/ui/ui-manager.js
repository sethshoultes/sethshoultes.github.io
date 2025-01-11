class UIManager {
    constructor(game) {
        this.game = game;
        this.elements = {
            score: document.getElementById('score'),
            timer: document.getElementById('timer'),
            stage: document.getElementById('stage'),
            wordInput: document.getElementById('word-input'),
            gameMenu: document.getElementById('game-menu'),
            gameOver: document.getElementById('game-over')
        };

        this.bindEvents();
    }

    bindEvents() {
        // Start Game
        document.getElementById('start-game').addEventListener('click', () => {
            this.hideMenu();
            this.game.start();
        });

        // Restart Game
        document.getElementById('restart-game').addEventListener('click', () => {
            this.hideGameOver();
            this.game.start();
        });

        // Return to Menu
        document.getElementById('return-menu').addEventListener('click', () => {
            this.hideGameOver();
            this.showMenu();
        });
    }

    updateScore(score) {
        this.elements.score.textContent = score;
    }

    updateTimer(time) {
        this.elements.timer.textContent = time;
    }

    updateStage(stage) {
        this.elements.stage.textContent = stage;
    }

    showWordInput() {
        this.elements.wordInput.classList.remove('hidden');
        this.elements.wordInput.querySelector('input').focus();
    }

    hideWordInput() {
        this.elements.wordInput.classList.add('hidden');
    }

    showMenu() {
        this.elements.gameMenu.classList.remove('hidden');
    }

    hideMenu() {
        this.elements.gameMenu.classList.add('hidden');
    }

    showGameOver(score) {
        document.getElementById('final-score').textContent = score;
        this.elements.gameOver.classList.remove('hidden');
    }

    hideGameOver() {
        this.elements.gameOver.classList.add('hidden');
    }
}