class Word {
    constructor(text, x, y, speed, angle) {
        this.text = text;
        this.x = x;
        this.y = y;
        this.speed = speed;
        this.angle = angle;
    }

    update(canvasWidth, canvasHeight) {
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;

        if (this.x < 0) this.x = canvasWidth;
        if (this.x > canvasWidth) this.x = 0;
        if (this.y < 0) this.y = canvasHeight;
        if (this.y > canvasHeight) this.y = 0;
    }

    draw(ctx) {
        ctx.font = '20px Arial';
        ctx.fillStyle = 'white';
        ctx.fillText(this.text, this.x, this.y);
    }
}

class WordManager {
    constructor(resourceManager) {
        if (!resourceManager) {
            throw new Error('ResourceManager is required for WordManager');
        }
        
        const wordConfig = resourceManager.getConfig('words');
        if (!wordConfig || !wordConfig.categories) {
            throw new Error('Invalid word configuration');
        }

        this.words = this.flattenCategories(wordConfig.categories);
        if (this.words.length === 0) {
            throw new Error('No words available in configuration');
        }
    }

    flattenCategories(categories) {
        try {
            return Object.values(categories)
                .flat()
                .filter(word => typeof word === 'string' && word.length > 0);
        } catch (error) {
            throw new Error('Failed to process word categories: ' + error.message);
        }
    }

    getRandomWord() {
        if (this.words.length === 0) {
            throw new Error('No words available');
        }
        const index = Math.floor(Math.random() * this.words.length);
        return this.words[index];
    }

    createWord(canvasWidth, canvasHeight, speed) {
        return new Word(
            this.getRandomWord(),
            Math.random() * canvasWidth,
            Math.random() * canvasHeight,
            speed,
            Math.random() * Math.PI * 2
        );
    }
}