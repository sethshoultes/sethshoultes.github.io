class Transitions {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.currentTransition = null;
    }

    async stageTransition(stageNumber) {
        return new Promise(resolve => {
            this.currentTransition = {
                type: 'stage',
                progress: 0,
                stageNumber: stageNumber,
                onComplete: resolve
            };
            
            this.animate();
        });
    }

    async gameOverTransition() {
        return new Promise(resolve => {
            this.currentTransition = {
                type: 'gameOver',
                progress: 0,
                onComplete: resolve
            };
            
            this.animate();
        });
    }

    animate() {
        if (!this.currentTransition) return;

        const transition = this.currentTransition;
        transition.progress += 0.02;

        this.ctx.save();
        
        if (transition.type === 'stage') {
            this.drawStageTransition(transition);
        } else if (transition.type === 'gameOver') {
            this.drawGameOverTransition(transition);
        }

        this.ctx.restore();

        if (transition.progress >= 1) {
            this.currentTransition = null;
            transition.onComplete();
        } else {
            requestAnimationFrame(() => this.animate());
        }
    }

    drawStageTransition(transition) {
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Background fade
        this.ctx.fillStyle = `rgba(0, 0, 0, ${transition.progress * 0.7})`;
        this.ctx.fillRect(0, 0, width, height);

        // Stage text
        this.ctx.font = 'bold 48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        const scale = 1 + Math.sin(transition.progress * Math.PI) * 0.3;
        
        this.ctx.save();
        this.ctx.translate(width / 2, height / 2);
        this.ctx.scale(scale, scale);
        
        // Glow effect
        this.ctx.shadowColor = '#4a90e2';
        this.ctx.shadowBlur = 20 * Math.sin(transition.progress * Math.PI);
        
        this.ctx.fillStyle = 'white';
        this.ctx.fillText(`Stage ${transition.stageNumber}`, 0, 0);
        
        this.ctx.restore();
    }

    drawGameOverTransition(transition) {
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Fade to black
        this.ctx.fillStyle = `rgba(0, 0, 0, ${transition.progress})`;
        this.ctx.fillRect(0, 0, width, height);

        // Game Over text
        if (transition.progress > 0.5) {
            const textProgress = (transition.progress - 0.5) * 2;
            
            this.ctx.font = 'bold 64px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillStyle = `rgba(255, 255, 255, ${textProgress})`;
            this.ctx.fillText('Game Over', width / 2, height / 2);
        }
    }
}