class Stats {
    constructor() {
        this.stats = {
            wordsTyped: 0,
            accuracy: {
                correct: 0,
                incorrect: 0
            },
            averageSpeed: [],
            maxCombo: 0,
            currentCombo: 0,
            stagesReached: 1,
            totalTime: 0,
            highestScore: 0
        };
    }

    recordWordAttempt(word, timeElapsed, isCorrect) {
        if (isCorrect) {
            this.stats.wordsTyped++;
            this.stats.accuracy.correct++;
            this.stats.currentCombo++;
            this.stats.maxCombo = Math.max(this.stats.maxCombo, this.stats.currentCombo);
            this.stats.averageSpeed.push({
                length: word.length,
                time: timeElapsed
            });
        } else {
            this.stats.accuracy.incorrect++;
            this.stats.currentCombo = 0;
        }
    }

    updateScore(score) {
        this.stats.highestScore = Math.max(this.stats.highestScore, score);
    }

    updateStage(stage) {
        this.stats.stagesReached = Math.max(this.stats.stagesReached, stage);
    }

    updateTime(time) {
        this.stats.totalTime = time;
    }

    getAccuracy() {
        const total = this.stats.accuracy.correct + this.stats.accuracy.incorrect;
        return total > 0 ? (this.stats.accuracy.correct / total) * 100 : 0;
    }

    getAverageWPM() {
        if (this.stats.averageSpeed.length === 0) return 0;
        
        const totalChars = this.stats.averageSpeed.reduce((sum, entry) => sum + entry.length, 0);
        const totalTime = this.stats.averageSpeed.reduce((sum, entry) => sum + entry.time, 0);
        
        // WPM = (characters / 5) / time in minutes
        return Math.round((totalChars / 5) / (totalTime / 60));
    }

    getGameSummary() {
        return {
            wordsTyped: this.stats.wordsTyped,
            accuracy: this.getAccuracy().toFixed(1),
            wpm: this.getAverageWPM(),
            maxCombo: this.stats.maxCombo,
            stagesReached: this.stats.stagesReached,
            totalTime: this.stats.totalTime,
            highestScore: this.stats.highestScore
        };
    }

    reset() {
        this.stats.wordsTyped = 0;
        this.stats.accuracy = { correct: 0, incorrect: 0 };
        this.stats.averageSpeed = [];
        this.stats.currentCombo = 0;
        this.stats.maxCombo = 0;
        this.stats.stagesReached = 1;
        this.stats.totalTime = 0;
    }
}