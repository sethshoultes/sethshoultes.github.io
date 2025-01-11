class ScoreUI {
    constructor() {
        this.scoreElement = document.getElementById('score');
        this.timerElement = document.getElementById('timer');
        this.stageElement = document.getElementById('stage');
        this.comboElement = null;
        
        this.initializeComboDisplay();
    }

    updateScore(score) {
        this.scoreElement.textContent = score;
    }

    updateTimer(time) {
        this.timerElement.textContent = time;
    }

    updateStage(stage) {
        this.stageElement.textContent = stage;
    }

    initializeComboDisplay() {
        this.comboElement = document.createElement('div');
        this.comboElement.className = 'combo-display hidden';
        document.getElementById('game-container').appendChild(this.comboElement);
    }

    showCombo(points, comboCount) {
        this.comboElement.innerHTML = `
            <div class="points">+${points}</div>
            ${comboCount > 1 ? `<div class="combo">Combo x${comboCount}!</div>` : ''}
        `;
        
        this.comboElement.classList.remove('hidden');
        this.comboElement.style.opacity = '1';
        this.comboElement.style.transform = 'translateY(0)';

        setTimeout(() => {
            this.comboElement.style.opacity = '0';
            this.comboElement.style.transform = 'translateY(-20px)';
            setTimeout(() => {
                this.comboElement.classList.add('hidden');
            }, 300);
        }, 1000);
    }
}