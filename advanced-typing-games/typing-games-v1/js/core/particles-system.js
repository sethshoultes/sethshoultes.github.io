class ParticlePool {
    constructor(maxSize = 1000) {
        this.pool = new Array(maxSize).fill(null).map(() => new Particle());
        this.active = new Set();
    }

    acquire() {
        const particle = this.pool.find(p => !this.active.has(p));
        if (particle) {
            this.active.add(particle);
            return particle;
        }
        return null;
    }

    release(particle) {
        this.active.delete(particle);
        particle.reset();
    }

    getActiveCount() {
        return this.active.size;
    }
}

class Particle {
    constructor() {
        this.reset();
    }

    reset() {
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.color = '#ffffff';
        this.alpha = 1;
        this.life = 0;
        this.maxLife = 0;
        this.size = 1;
        this.active = false;
    }

    init(config) {
        Object.assign(this, config);
        this.active = true;
        return this;
    }

    update(deltaTime) {
        if (!this.active) return false;

        this.life -= deltaTime;
        if (this.life <= 0) {
            this.active = false;
            return false;
        }

        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;
        this.alpha = this.life / this.maxLife;
        return true;
    }
}

class ParticleSystem {
    constructor(config = {}) {
        this.config = {
            maxParticles: config.maxParticles || 1000,
            batchSize: config.batchSize || 20
        };

        this.pool = new ParticlePool(this.config.maxParticles);
        this.effects = {
            collision: {
                count: 20,
                color: '#ffffff',
                size: { min: 1, max: 3 },
                speed: { min: 50, max: 150 },
                life: { min: 0.5, max: 1 }
            },
            correct: {
                count: 30,
                color: '#4CAF50',
                size: { min: 2, max: 4 },
                speed: { min: 100, max: 200 },
                life: { min: 0.8, max: 1.2 }
            },
            combo: {
                count: 40,
                color: '#FFC107',
                size: { min: 3, max: 5 },
                speed: { min: 150, max: 250 },
                life: { min: 1, max: 1.5 }
            }
        };

        // WebGL renderer for particles if supported
        this.initRenderer();
    }

    initRenderer() {
        try {
            this.canvas = document.createElement('canvas');
            this.gl = this.canvas.getContext('webgl2', { alpha: true });
            if (this.gl) {
                this.initWebGL();
            }
        } catch (e) {
            console.warn('WebGL not available for particles, falling back to Canvas');
            this.gl = null;
        }
    }

    createEffect(type, x, y) {
        const effect = this.effects[type];
        if (!effect) return;

        const count = Math.min(effect.count, this.config.batchSize);
        
        for (let i = 0; i < count; i++) {
            const particle = this.pool.acquire();
            if (!particle) break;

            const angle = (Math.PI * 2 * i) / count;
            const speed = this.random(effect.speed.min, effect.speed.max);
            const life = this.random(effect.life.min, effect.life.max);
            const size = this.random(effect.size.min, effect.size.max);

            particle.init({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                color: effect.color,
                life,
                maxLife: life,
                size
            });
        }
    }

    update(deltaTime) {
        this.pool.active.forEach(particle => {
            if (!particle.update(deltaTime)) {
                this.pool.release(particle);
            }
        });
    }

    render(ctx) {
        if (this.gl && this.pool.getActiveCount() > 50) {
            this.renderWebGL();
        } else {
            this.renderCanvas(ctx);
        }
    }

    renderCanvas(ctx) {
        ctx.save();
        this.pool.active.forEach(particle => {
            ctx.globalAlpha = particle.alpha;
            ctx.fillStyle = particle.color;
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    }

    renderWebGL() {
        // WebGL rendering implementation for better performance
        // with large numbers of particles
        if (!this.gl) return;

        const gl = this.gl;
        gl.clear(gl.COLOR_BUFFER_BIT);

        // Update particle buffer data
        const particles = Array.from(this.pool.active);
        const particleData = new Float32Array(particles.length * 6); // x, y, size, r, g, b

        particles.forEach((particle, i) => {
            const offset = i * 6;
            particleData[offset] = particle.x;
            particleData[offset + 1] = particle.y;
            particleData[offset + 2] = particle.size;
            // Convert color to RGB
            const color = this.hexToRgb(particle.color);
            particleData[offset + 3] = color.r / 255;
            particleData[offset + 4] = color.g / 255;
            particleData[offset + 5] = color.b / 255;
        });

        gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, particleData, gl.DYNAMIC_DRAW);
        gl.drawArrays(gl.POINTS, 0, particles.length);
    }

    random(min, max) {
        return Math.random() * (max - min) + min;
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 255, g: 255, b: 255 };
    }

    clear() {
        this.pool.active.clear();
    }

    getCount() {
        return this.pool.getActiveCount();
    }
}