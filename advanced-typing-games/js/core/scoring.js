class ScoringSystem {
    constructor(config) {
        this.config = config;
        this.baseScore = config.game.settings.baseScore;
        this.currentMultiplier = 1;
        this.combo = 0;
        this.maxCombo = 0;
        this.accuracy = {
            hits: 0,
            misses: 0
        };
    }

    calculateWordScore(timeElapsed, wordLength, stageMultiplier) {
        // Base calculation
        let score = this.baseScore;

        // Time bonus (faster = more points)
        const timeBonus = Math.max(0, 1 - (timeElapsed / 5)); // 5 seconds as baseline
        score *= (1 + timeBonus);

        // Length bonus
        const lengthBonus = wordLength / 5; // 5 letters as baseline
        score *= (1 + lengthBonus);

        // Stage multiplier
        score *= stageMultiplier;

        // Combo multiplier
        score *= (1 + (this.combo * 0.1)); // 10% bonus per combo

        return Math.round(score);
    }

    registerHit(timeElapsed, wordLength, stageMultiplier) {
        this.combo++;
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        this.accuracy.hits++;
        return this.calculateWordScore(timeElapsed, wordLength, stageMultiplier);
    }

    registerMiss() {
        this.combo = 0;
        this.accuracy.misses++;
    }

    getAccuracy() {
        const total = this.accuracy.hits + this.accuracy.misses;
        return total > 0 ? (this.accuracy.hits / total) * 100 : 0;
    }

    getStats() {
        return {
            accuracy: this.getAccuracy(),
            maxCombo: this.maxCombo,
            hits: this.accuracy.hits,
            misses: this.accuracy.misses
        };
    }
}