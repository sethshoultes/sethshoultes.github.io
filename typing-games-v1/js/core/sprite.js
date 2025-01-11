class Sprite {
    constructor(config) {
        this.type = config.type;
        this.size = config.size;
        this.color = config.color;
        this.x = config.x;
        this.y = config.y;
        this.speed = config.speed;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.fillStyle = this.color;

        switch (this.type) {
            case 'star':
                this.drawStar(ctx);
                break;
            case 'diamond':
                this.drawDiamond(ctx);
                break;
            case 'circle':
                this.drawCircle(ctx);
                break;
            default:
                this.drawCircle(ctx);
        }

        ctx.restore();
    }

    drawStar(ctx) {
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            ctx.lineTo(
                Math.cos((i * 4 * Math.PI) / 5) * this.size,
                Math.sin((i * 4 * Math.PI) / 5) * this.size
            );
        }
        ctx.closePath();
        ctx.fill();
    }

    drawDiamond(ctx) {
        ctx.beginPath();
        ctx.moveTo(0, -this.size);
        ctx.lineTo(this.size, 0);
        ctx.lineTo(0, this.size);
        ctx.lineTo(-this.size, 0);
        ctx.closePath();
        ctx.fill();
    }

    drawCircle(ctx) {
        ctx.beginPath();
        ctx.arc(0, 0, this.size, 0, Math.PI * 2);
        ctx.fill();
    }

    collidesWith(word) {
        const dx = word.x - this.x;
        const dy = word.y - this.y;
        return Math.sqrt(dx * dx + dy * dy) < this.size + 20;
    }
}