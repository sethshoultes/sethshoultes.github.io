class AudioManager {
    constructor() {
        this.sounds = {};
        this.isMuted = false;
        this.volume = 0.5;
        
        this.soundConfigs = {
            collision: { src: 'assets/sounds/collision.mp3', volume: 0.4 },
            type: { src: 'assets/sounds/type.mp3', volume: 0.2 },
            correct: { src: 'assets/sounds/correct.mp3', volume: 0.4 },
            combo: { src: 'assets/sounds/combo.mp3', volume: 0.4 },
            stageClear: { src: 'assets/sounds/stage-clear.mp3', volume: 0.5 },
            gameOver: { src: 'assets/sounds/game-over.mp3', volume: 0.5 }
        };

        this.init();
    }

    async init() {
        try {
            for (const [key, config] of Object.entries(this.soundConfigs)) {
                this.sounds[key] = await this.loadSound(config.src);
                this.sounds[key].volume = config.volume * this.volume;
            }
        } catch (error) {
            console.warn('Failed to load some sound effects:', error);
        }
    }

    async loadSound(src) {
        return new Promise((resolve, reject) => {
            const audio = new Audio();
            audio.addEventListener('canplaythrough', () => resolve(audio));
            audio.addEventListener('error', reject);
            audio.src = src;
        });
    }

    play(soundName) {
        if (this.isMuted || !this.sounds[soundName]) return;
        const sound = this.sounds[soundName].cloneNode();
        sound.volume = this.sounds[soundName].volume;
        sound.play().catch(error => {
            console.warn(`Failed to play sound ${soundName}:`, error);
        });
    }

    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        for (const [key, sound] of Object.entries(this.sounds)) {
            sound.volume = this.soundConfigs[key].volume * this.volume;
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        return this.isMuted;
    }
}