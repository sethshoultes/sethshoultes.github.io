class Particle {
    constructor(x, y, color, velocity, life, size) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.velocity = velocity;
        this.life = life;
        this.maxLife = life;
        this.size = size;
        this.alpha = 1;
    }

    update() {
        this.x += this.velocity.x;
        this.y += this.velocity.y;
        this.life--;
        this.alpha = this.life / this.maxLife;
        return this.life > 0;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

class ParticleSystem {
    constructor() {
        this.particles = [];
        this.effects = {
            collision: {
                count: 20,
                color: '#ffffff',
                life: 30,
                size: 2,
                spread: 2
            },
            correct: {
                count: 30,
                color: '#4CAF50',
                life: 40,
                size: 3,
                spread: 3
            },
            combo: {
                count: 40,
                color: '#FFC107',
                life: 50,
                size: 4,
                spread: 4
            }
        };
    }

    createEffect(type, x, y) {
        const effect = this.effects[type];
        if (!effect) return;

        for (let i = 0; i < effect.count; i++) {
            const angle = (Math.PI * 2 * i) / effect.count;
            const speed = Math.random() * effect.spread;
            
            this.particles.push(new Particle(
                x,
                y,
                effect.color,
                {
                    x: Math.cos(angle) * speed,
                    y: Math.sin(angle) * speed
                },
                effect.life + Math.random() * 20,
                effect.size * Math.random()
            ));
        }
    }

    update() {
        this.particles = this.particles.filter(particle => particle.update());
    }

    draw(ctx) {
        this.particles.forEach(particle => particle.draw(ctx));
    }
}