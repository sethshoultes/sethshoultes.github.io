class Storage {
    constructor() {
        this.storageKey = 'typingGame';
    }

    getItem(key) {
        const data = localStorage.getItem(this.storageKey);
        if (data) {
            const parsed = JSON.parse(data);
            return parsed[key];
        }
        return null;
    }

    setItem(key, value) {
        let data = localStorage.getItem(this.storageKey);
        data = data ? JSON.parse(data) : {};
        data[key] = value;
        localStorage.setItem(this.storageKey, JSON.stringify(data));
    }

    getHighScores(gameId) {
        const scores = this.getItem('highScores');
        return scores && scores[gameId] ? scores[gameId] : [];
    }

    saveHighScore(gameId, score) {
        const scores = this.getItem('highScores') || {};
        scores[gameId] = scores[gameId] || [];
        scores[gameId].push({
            score,
            date: new Date().toISOString(),
            stages: this.getItem('currentStage') || 1
        });
        scores[gameId].sort((a, b) => b.score - a.score);
        scores[gameId] = scores[gameId].slice(0, 10); // Keep top 10
        this.setItem('highScores', scores);
    }
}