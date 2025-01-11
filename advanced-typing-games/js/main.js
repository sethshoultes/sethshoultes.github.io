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
            // Load configurations
            await this.configLoader.init();

            // Initialize components
            this.storage = new Storage();
            this.menuUI = new MenuUI(this);
            this.scoreUI = new ScoreUI();

            // Initialize game
            this.game = new Game(
                this.configLoader.getConfig(),
                this.storage,
                this.scoreUI
            );

            // Setup event listeners
            this.setupEventListeners();

            // Show menu
            this.menuUI.show();
        } catch (error) {
            console.error('Failed to initialize game:', error);
            this.handleInitError(error);
        }
    }

    setupEventListeners() {
        // Start game button
        document.getElementById('start-game').addEventListener('click', () => {
            this.menuUI.hide();
            this.game.start();
        });

        // Restart game button
        document.getElementById('restart-game').addEventListener('click', () => {
            document.getElementById('game-over').classList.add('hidden');
            this.game.start();
        });

        // Return to menu button
        document.getElementById('return-menu').addEventListener('click', () => {
            document.getElementById('game-over').classList.add('hidden');
            this.menuUI.show();
        });

        // High scores button
        document.getElementById('high-scores').addEventListener('click', () => {
            this.showHighScores();
        });

        // Settings button
        document.getElementById('settings').addEventListener('click', () => {
            this.showSettings();
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