class ConfigLoader {
    constructor() {
        this.configs = {
            game: null,
            stages: {},
            words: {},
            theme: null
        };
    }

    async init(gameId = 'default') {
        try {
            // Load game configuration
            this.configs.game = await this.loadConfig('games', gameId);
            
            // Load stages
            for (const stageId of this.configs.game.stages) {
                this.configs.stages[stageId] = await this.loadConfig('stages', stageId);
            }

            // Load word lists
            for (const wordListId of this.configs.game.wordLists) {
                this.configs.words[wordListId] = await this.loadConfig('words', wordListId);
            }

            // Load theme
            this.configs.theme = await this.loadConfig('themes', this.configs.game.theme);

            return this.configs;
        } catch (error) {
            console.error('Error loading configurations:', error);
            throw new Error('Failed to load game configurations');
        }
    }

    async loadConfig(type, id) {
        try {
            const response = await fetch(`config/${type}/${id}.json`);
            if (!response.ok) {
                throw new Error(`Failed to load ${type} configuration: ${id}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`Error loading ${type} configuration:`, error);
            throw error;
        }
    }

    getConfig() {
        return this.configs;
    }

    getGameConfig() {
        return this.configs.game;
    }

    getStageConfig(stageId) {
        return this.configs.stages[stageId];
    }

    getWordList(wordListId) {
        return this.configs.words[wordListId];
    }

    getTheme() {
        return this.configs.theme;
    }
}