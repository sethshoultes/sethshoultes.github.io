import { GameSettings } from './GameSettings';

export class Player {
  x: number;
  y: number;
  width: number;
  height: number;
  velocityX: number;
  velocityY: number;
  speed: number;
  gravity: number;
  flapping: boolean;
  facingRight: boolean;
  invulnerable: boolean;
  invulnerableTimer: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.width = GameSettings.PLAYER.WIDTH;
    this.height = GameSettings.PLAYER.HEIGHT;
    this.velocityX = 0;
    this.velocityY = 0;
    this.speed = GameSettings.PLAYER.SPEED;
    this.gravity = GameSettings.PLAYER.GRAVITY;
    this.flapping = false;
    this.facingRight = true;
    this.invulnerable = false;
    this.invulnerableTimer = 0;
  }

  moveLeft() {
    this.velocityX = -this.speed;
    this.facingRight = false;
  }

  moveRight() {
    this.velocityX = this.speed;
    this.facingRight = true;
  }

  stop() {
    this.velocityX = 0;
  }

  flap() {
    if (this.velocityY > GameSettings.PLAYER.FLAP_FORCE) {
      this.velocityY = GameSettings.PLAYER.FLAP_FORCE;
    }
    this.flapping = true;
  }

  stopFlapping() {
    this.flapping = false;
  }

  reset(canvas: HTMLCanvasElement) {
    this.x = canvas.width / 2;
    this.y = canvas.height - this.height; // Position exactly on the floor
    this.velocityX = 0;
    this.velocityY = 0;
    this.invulnerable = true;
    this.invulnerableTimer = Date.now();
  }

  update(platforms: any[]) {
    if (this.invulnerable && Date.now() - this.invulnerableTimer > GameSettings.PLAYER.INVULNERABILITY_TIME) {
      this.invulnerable = false;
    }

    // Apply gravity
    if (this.flapping) {
      this.velocityY += this.gravity * 0.5;
    } else {
      this.velocityY += this.gravity;
    }
    
    // Terminal velocity
    if (this.velocityY > GameSettings.PLAYER.TERMINAL_VELOCITY) {
      this.velocityY = GameSettings.PLAYER.TERMINAL_VELOCITY;
    }
    
    // Update horizontal position first
    const nextX = this.x + this.velocityX;
    this.x = nextX;

    // Screen boundaries for X
    if (this.x < 0) {
      this.x = GameSettings.CANVAS_WIDTH - this.width;
    } else if (this.x + this.width > GameSettings.CANVAS_WIDTH) {
      this.x = 0;
    }

    // Calculate next vertical position
    const nextY = this.y + this.velocityY;
    let collision = false;

    // Check platform collisions before updating Y position
    platforms.forEach(platform => {
      const willCollideVertically = 
        nextY + this.height > platform.y &&
        nextY < platform.y + platform.height;
      
      const isOverlappingHorizontally =
        this.x + this.width > platform.x &&
        this.x < platform.x + platform.width;

      if (
        willCollideVertically &&
        isOverlappingHorizontally
      ) {
        collision = true;
        // Only snap to platform if falling down
        if (this.velocityY > 0) {
          this.y = platform.y - this.height;
          this.velocityY = 0;
        } else if (this.velocityY < 0) {
          // Hit platform from below
          this.y = platform.y + platform.height;
          this.velocityY = 0;
        }
      }
    });

    // If no collision occurred, update Y position
    if (!collision) {
      this.y = nextY;
    }

    // Vertical screen boundaries
    if (this.y < 0) {
      this.y = 0;
      this.velocityY = 0; // Stop upward momentum when hitting ceiling
    }
    if (this.y + this.height > GameSettings.CANVAS_HEIGHT) {
      this.y = GameSettings.CANVAS_HEIGHT - this.height;
      this.velocityY = 0;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const birdColor = this.invulnerable && Math.floor(Date.now() / 100) % 2 === 0
      ? GameSettings.PLAYER.COLORS.INVULNERABLE
      : GameSettings.PLAYER.COLORS.NORMAL;
    
    // Draw bird in minimalist style
    ctx.fillStyle = birdColor;
    
    // Main body (rounded rectangle)
    ctx.beginPath();
    ctx.roundRect(this.x + 18, this.y + 12, 24, 24, 8);
    ctx.fill();
    
    // Wings with arcade-style animation
    const wingOffset = Math.sin(Date.now() / GameSettings.ANIMATION.WING_SPEED) * GameSettings.ANIMATION.WING_AMPLITUDE;
    if (this.flapping) {
      // Extended flapping wings (curved)
      ctx.beginPath();
      ctx.ellipse(this.x + 12, this.y + 24 + wingOffset, 8, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(this.x + 48, this.y + 24 + wingOffset, 8, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Resting wings (smaller ellipses)
      ctx.beginPath();
      ctx.ellipse(this.x + 15, this.y + 24 + wingOffset, 4, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(this.x + 45, this.y + 24 + wingOffset, 4, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw legs
    const legOffset = Math.sin(Date.now() / GameSettings.ANIMATION.LEG_SPEED) * GameSettings.ANIMATION.LEG_AMPLITUDE;
    ctx.beginPath();
    ctx.roundRect(this.x + 24, this.y + 36, 3, 10 + legOffset, 1.5);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(this.x + 33, this.y + 36, 3, 10 - legOffset, 1.5);
    ctx.fill();

    // Draw rider
    ctx.fillStyle = GameSettings.PLAYER.COLORS.RIDER;
    // Head (rounded)
    ctx.beginPath();
    ctx.roundRect(this.x + 24, this.y + 2, 12, 12, 4);
    ctx.fill();
    // Body (rounded)
    ctx.beginPath();
    ctx.roundRect(this.x + 26, this.y + 14, 8, 16, 3);
    ctx.fill();

    // Draw lance in arcade style
    ctx.fillStyle = GameSettings.PLAYER.COLORS.LANCE;
    ctx.beginPath();
    if (this.facingRight) {
      ctx.roundRect(this.x + 42, this.y + 24, 18, 3, 1.5);
    } else {
      ctx.roundRect(this.x, this.y + 24, 18, 3, 1.5);
    }
    ctx.fill();
  }

  checkCollision(enemy: any) {
    return (
      this.x < enemy.x + enemy.width &&
      this.x + this.width > enemy.x &&
      this.y < enemy.y + enemy.height &&
      this.y + this.height > enemy.y
    );
  }
}