class GameManager {
    constructor() {
        this.configLoader = new ConfigLoader();
        this.game = null;
        this.menuUI = null;
        this.scoreUI = null;
        this.storage = null;
    }

    async init() {
        try {
            await this.configLoader.init();
            this.storage = new Storage();
            this.menuUI = new MenuUI(this);
            this.scoreUI = new ScoreUI();

            this.game = new Game(
                this.configLoader.getConfig(),
                this.storage,
                this.scoreUI
            );

            this.setupEventListeners();
            this.setupSoundControls();
            this.menuUI.show();
        } catch (error) {
            console.error('Failed to initialize game:', error);
            this.handleInitError(error);
        }
    }

    setupEventListeners() {
        document.getElementById('start-game').addEventListener('click', () => {
            this.menuUI.hide();
            this.game.start();
        });

        document.getElementById('restart-game').addEventListener('click', () => {
            document.getElementById('game-over').classList.add('hidden');
            this.game.start();
        });

        document.getElementById('return-menu').addEventListener('click', () => {
            document.getElementById('game-over').classList.add('hidden');
            this.menuUI.show();
        });

        document.getElementById('high-scores').addEventListener('click', () => {
            this.showHighScores();
        });

        document.getElementById('settings').addEventListener('click', () => {
            this.showSettings();
        });
    }

    setupSoundControls() {
        const toggleButton = document.getElementById('toggle-sound');
        const volumeSlider = document.getElementById('volume-slider');
        const soundIcon = toggleButton.querySelector('.sound-icon');

        toggleButton.addEventListener('click', () => {
            const isMuted = this.game.audioManager.toggleMute();
            soundIcon.textContent = isMuted ? '🔈' : '🔊';
        });

        volumeSlider.addEventListener('input', (e) => {
            const volume = e.target.value / 100;
            this.game.audioManager.setVolume(volume);
        });
    }

    handleInitError(error) {
        const container = document.getElementById('game-container');
        container.innerHTML = `
            <div class="error-screen">
                <h2>Failed to Load Game</h2>
                <p>${error.message}</p>
                <button onclick="location.reload()">Retry</button>
            </div>
        `;
    }

    showHighScores() {
        // Implement high scores display
    }

    showSettings() {
        // Implement settings display
    }
}

// Initialize game when document is ready
document.addEventListener('DOMContentLoaded', () => {
    const gameManager = new GameManager();
    gameManager.init();
});