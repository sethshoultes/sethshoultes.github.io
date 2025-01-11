class GameApp {
    constructor() {
        this.resourceManager = new ResourceManager();
        this.game = null;
        this.ui = null;
    }

    async init() {
        try {
            // Show loading screen
            const loadingScreen = document.querySelector('.loading-screen');
            const gameContainer = document.getElementById('game-container');
            
            // Ensure loading screen is visible and game is hidden
            loadingScreen.style.display = 'flex';
            gameContainer.classList.add('hidden');

            // Load resources
            await this.resourceManager.init();

            // Initialize game
            this.game = new Game(this.resourceManager);
            this.ui = new UIManager(this.game);

            // Hide loading screen and show game
            loadingScreen.style.display = 'none';
            gameContainer.classList.remove('hidden');
            
            // Show menu
            this.ui.showMenu();

        } catch (error) {
            console.error('Failed to initialize game:', error);
            this.showError(error);
        }
    }

    showError(error) {
        const loadingScreen = document.querySelector('.loading-screen');
        loadingScreen.style.display = 'none';
        
        const errorElement = document.createElement('div');
        errorElement.className = 'error-screen';
        errorElement.innerHTML = `
            <div class="error-content">
                <h2>Error</h2>
                <p>${error.message}</p>
                <button onclick="location.reload()">Retry</button>
            </div>
        `;
        
        document.body.appendChild(errorElement);
    }
}

// Start the game when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new GameApp();
    app.init();
});