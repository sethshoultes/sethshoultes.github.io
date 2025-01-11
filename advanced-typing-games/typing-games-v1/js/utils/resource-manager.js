class ResourceManager {
    constructor() {
        this.resources = new Map();
        this.loading = false;
        this.progress = 0;
        this.loadingScreen = null;
        this.errorScreen = null;
    }

    async init() {
        this.createLoadingScreen();
        this.createErrorScreen();
        
        try {
            this.loading = true;
            this.showLoadingScreen();
            
            await Promise.all([
                this.loadConfigs(),
                this.loadSounds(),
                this.loadFonts()
            ]);

            this.loading = false;
            this.hideLoadingScreen();
            return true;
        } catch (error) {
            this.handleLoadError(error);
            return false;
        }
    }

    createLoadingScreen() {
        this.loadingScreen = document.createElement('div');
        this.loadingScreen.className = 'loading-screen';
        this.loadingScreen.innerHTML = `
            <div class="loading-content">
                <h2>Loading Game...</h2>
                <div class="progress-bar">
                    <div class="progress"></div>
                </div>
            </div>
        `;
        document.body.appendChild(this.loadingScreen);
    }

    createErrorScreen() {
        this.errorScreen = document.createElement('div');
        this.errorScreen.className = 'error-screen hidden';
        this.errorScreen.innerHTML = `
            <div class="error-content">
                <h2>Error Loading Game</h2>
                <p class="error-message"></p>
                <button onclick="location.reload()">Retry</button>
            </div>
        `;
        document.body.appendChild(this.errorScreen);
    }

    updateProgress(progress) {
        this.progress = Math.min(100, Math.max(0, progress));
        const progressBar = this.loadingScreen.querySelector('.progress');
        if (progressBar) {
            progressBar.style.width = `${this.progress}%`;
        }
    }

    showLoadingScreen() {
        this.loadingScreen.classList.remove('hidden');
        this.errorScreen.classList.add('hidden');
    }

    hideLoadingScreen() {
        this.loadingScreen.classList.add('hidden');
    }

    handleLoadError(error) {
        console.error('Loading Error:', error);
        this.loading = false;
        this.hideLoadingScreen();
        
        const errorMessage = this.errorScreen.querySelector('.error-message');
        errorMessage.textContent = error.message || 'Failed to load game resources';
        this.errorScreen.classList.remove('hidden');
    }

    async loadConfigs() {
        const configs = ['game', 'stages', 'words', 'theme'];
        let loaded = 0;

        for (const config of configs) {
            try {
                const response = await fetch(`config/${config}/default.json`);
                if (!response.ok) throw new Error(`Failed to load ${config} config`);
                
                const data = await response.json();
                this.resources.set(`config_${config}`, data);
                
                loaded++;
                this.updateProgress((loaded / configs.length) * 100);
            } catch (error) {
                throw new Error(`Config loading error: ${error.message}`);
            }
        }
    }

    async loadSounds() {
        const sounds = {
            collision: 'collision.mp3',
            type: 'type.mp3',
            correct: 'correct.mp3',
            combo: 'combo.mp3',
            stageClear: 'stage-clear.mp3',
            gameOver: 'game-over.mp3'
        };

        const totalSounds = Object.keys(sounds).length;
        let loaded = 0;

        for (const [key, file] of Object.entries(sounds)) {
            try {
                const audio = new Audio(`assets/sounds/${file}`);
                await new Promise((resolve, reject) => {
                    audio.addEventListener('canplaythrough', resolve);
                    audio.addEventListener('error', reject);
                    
                    // Add timeout
                    setTimeout(() => reject(new Error(`Timeout loading sound: ${file}`)), 5000);
                });

                this.resources.set(`sound_${key}`, audio);
                loaded++;
                this.updateProgress((loaded / totalSounds) * 100);
            } catch (error) {
                console.warn(`Failed to load sound ${file}, using fallback`);
                // Create silent audio as fallback
                this.resources.set(`sound_${key}`, new Audio());
            }
        }
    }

    async loadFonts() {
        // Load custom fonts if needed
        try {
            await document.fonts.ready;
        } catch (error) {
            console.warn('Custom fonts not loaded, using system fonts');
        }
    }

    getConfig(name) {
        return this.resources.get(`config_${name}`);
    }

    getSound(name) {
        return this.resources.get(`sound_${name}`);
    }
}