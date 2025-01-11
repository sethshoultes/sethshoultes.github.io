class MenuUI {
    constructor(gameManager) {
        this.gameManager = gameManager;
        this.menuElement = document.getElementById('game-menu');
        this.highScoresElement = null;
        this.settingsElement = null;
        
        this.initializeHighScores();
        this.initializeSettings();
    }

    show() {
        this.menuElement.classList.remove('hidden');
        this.updateHighScores();
    }

    hide() {
        this.menuElement.classList.add('hidden');
        if (this.highScoresElement) {
            this.highScoresElement.classList.add('hidden');
        }
        if (this.settingsElement) {
            this.settingsElement.classList.add('hidden');
        }
    }

    initializeHighScores() {
        this.highScoresElement = document.createElement('div');
        this.highScoresElement.className = 'high-scores-panel hidden';
        this.highScoresElement.innerHTML = `
            <div class="panel-header">
                <h2>High Scores</h2>
                <button class="close-button">×</button>
            </div>
            <div class="scores-list"></div>
        `;
        
        document.body.appendChild(this.highScoresElement);
        
        this.highScoresElement.querySelector('.close-button').addEventListener('click', () => {
            this.highScoresElement.classList.add('hidden');
        });
    }

    initializeSettings() {
        this.settingsElement = document.createElement('div');
        this.settingsElement.className = 'settings-panel hidden';
        this.settingsElement.innerHTML = `
            <div class="panel-header">
                <h2>Settings</h2>
                <button class="close-button">×</button>
            </div>
            <div class="settings-content">
                <div class="setting-item">
                    <label>Sound Effects</label>
                    <input type="checkbox" id="sound-enabled" checked>
                </div>
                <div class="setting-item">
                    <label>Music</label>
                    <input type="checkbox" id="music-enabled" checked>
                </div>
                <div class="setting-item">
                    <label>Particle Effects</label>
                    <input type="checkbox" id="particles-enabled" checked>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.settingsElement);
        
        this.settingsElement.querySelector('.close-button').addEventListener('click', () => {
            this.settingsElement.classList.add('hidden');
        });
    }

    updateHighScores() {
        const scoresList = this.highScoresElement.querySelector('.scores-list');
        const scores = this.gameManager.storage.getHighScores(this.gameManager.config.game.id);
        
        scoresList.innerHTML = scores.length > 0 
            ? scores.map((score, index) => `
                <div class="score-item">
                    <span class="rank">#${index + 1}</span>
                    <span class="score">${score.score}</span>
                    <span class="date">${new Date(score.date).toLocaleDateString()}</span>
                </div>
            `).join('')
            : '<div class="no-scores">No high scores yet!</div>';
    }

    showHighScores() {
        this.updateHighScores();
        this.highScoresElement.classList.remove('hidden');
    }

    showSettings() {
        this.settingsElement.classList.remove('hidden');
    }
}