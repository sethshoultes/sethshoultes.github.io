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
    constructor(wordConfigs) {
        this.wordLists = wordConfigs;
        this.categories = this.flattenCategories();
    }

    flattenCategories() {
        const words = [];
        Object.values(this.wordLists).forEach(list => {
            Object.values(list.categories).forEach(category => {
                words.push(...category);
            });
        });
        return words;
    }

    getRandomWord() {
        return this.categories[Math.floor(Math.random() * this.categories.length)];
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