import { GameSettings } from './GameSettings';
import { EnemyType, ENEMY_CONFIGS } from './EnemyType';

export class Enemy {
  x: number;
  y: number;
  width: number;
  height: number;
  type: EnemyType;
  velocityX: number;
  velocityY: number;
  speed: number;
  gravity: number;
  facingRight: boolean;
  lastJumpTime: number;
  jumpDelay: number;
  config: typeof ENEMY_CONFIGS[EnemyType];

  constructor(x: number, y: number, type: EnemyType) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.config = ENEMY_CONFIGS[type];
    this.width = GameSettings.ENEMY.WIDTH;
    this.height = GameSettings.ENEMY.HEIGHT;
    this.velocityX = Math.random() > 0.5 ? GameSettings.ENEMY.BASE_SPEED : -GameSettings.ENEMY.BASE_SPEED;
    this.velocityY = 0;
    this.speed = this.config.speed;
    this.gravity = GameSettings.ENEMY.GRAVITY;
    this.facingRight = this.velocityX > 0;
    this.lastJumpTime = 0;
    this.jumpDelay = GameSettings.ENEMY.JUMP_DELAY.MIN + Math.random() * (GameSettings.ENEMY.JUMP_DELAY.MAX - GameSettings.ENEMY.JUMP_DELAY.MIN);
  }

  update(platforms: any[]) {
    const currentTime = Date.now();
    
    // Special movement for pterodactyl
    if (this.type === 'pterodactyl') {
      // Swooping movement pattern
      this.velocityY = Math.sin(currentTime / 500) * 3;
      
      // Random direction changes with higher frequency
      if (Math.random() < 0.03) {
        this.velocityX *= -1;
        // Increase speed for more aggressive movement
        this.velocityX *= (1 + Math.random() * 0.8);
      }
      
      // Update position
      this.x += this.velocityX * 1.5; // Move faster horizontally
      this.y += this.velocityY;
      
      // Screen wrapping with slight vertical adjustment
      if (this.x < 0 || this.x + this.width > 800) {
        this.x = this.x < 0 ? 800 - this.width : 0;
        this.y = Math.max(50, Math.min(400, this.y + (Math.random() - 0.5) * 100));
      }
      
      // Keep within vertical bounds
      if (this.y < 50) this.y = 50;
      if (this.y + this.height > 500) this.y = 500 - this.height;
      
      return; // Skip regular enemy behavior
    }
    
    // Random jumps even when not on platform
    if (currentTime - this.lastJumpTime > this.jumpDelay && 
        Math.random() < 0.1 && 
        this.y < 300) { // Only jump if below half screen height
      this.velocityY = this.config.jumpForce; // Reduced jump height
      this.lastJumpTime = currentTime;
      this.jumpDelay = 500 + Math.random() * 1000;
    }

    // Apply gravity
    this.velocityY += this.gravity;
    
    // Terminal velocity
    if (this.velocityY > 6) {
      this.velocityY = 6;
    }
    
    // Update position
    this.x += this.velocityX;
    this.y += this.velocityY;

    // Update facing direction
    this.facingRight = this.velocityX > 0;

    // Random direction changes
    if (Math.random() < 0.02) {
      this.velocityX *= -1;
      // Occasionally increase speed for more dynamic movement
      this.velocityX *= (1 + Math.random() * 0.5);
      if (Math.abs(this.velocityX) > this.speed * 1.5) {
        this.velocityX = Math.sign(this.velocityX) * this.speed * 1.5;
      }
    }

    // Platform collisions
    platforms.forEach(platform => {
      if (
        this.y + this.height > platform.y &&
        this.y < platform.y + platform.height &&
        this.x + this.width > platform.x &&
        this.x < platform.x + platform.width
      ) {
        this.y = platform.y - this.height;
        this.velocityY = 0;
        
        // Jump after delay
        if (currentTime - this.lastJumpTime > this.jumpDelay) {
          this.velocityY = this.config.jumpForce; // Reduced jump height
          this.lastJumpTime = currentTime;
          this.jumpDelay = 500 + Math.random() * 1000;
          // Add horizontal boost when jumping
          this.velocityX += (Math.random() - 0.5) * 2;
        }
      }
    });

    // Screen boundaries
    if (this.x < 0 || this.x + this.width > 800) {
      this.x = this.x < 0 ? 800 - this.width : 0;
    }
    if (this.y < 0) {
      this.y = 0;
      this.velocityY = 0; // Stop upward momentum when hitting ceiling
    }
    if (this.y + this.height > 600) {
      this.y = 600 - this.height;
      this.velocityY = 0;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    // Draw enemy in minimalist style
    ctx.fillStyle = this.config.color; // Lime green for enemies

    if (this.type === 'pterodactyl') {
      // Draw pterodactyl body
      ctx.beginPath();
      ctx.moveTo(this.x + 30, this.y + 30);
      ctx.lineTo(this.x + 45, this.y + 20);
      ctx.lineTo(this.x + 60, this.y + 30);
      ctx.lineTo(this.x + 45, this.y + 40);
      ctx.closePath();
      ctx.fill();

      // Draw wings with animation
      const wingOffset = Math.sin(Date.now() / 100) * 10;
      ctx.beginPath();
      ctx.moveTo(this.x + 45, this.y + 30);
      ctx.lineTo(this.x + 30, this.y + 30 + wingOffset);
      ctx.lineTo(this.x + 15, this.y + 25);
      ctx.lineTo(this.x + 30, this.y + 30);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(this.x + 45, this.y + 30);
      ctx.lineTo(this.x + 60, this.y + 30 + wingOffset);
      ctx.lineTo(this.x + 75, this.y + 25);
      ctx.lineTo(this.x + 60, this.y + 30);
      ctx.closePath();
      ctx.fill();

      // Draw head
      ctx.beginPath();
      ctx.moveTo(this.x + 45, this.y + 20);
      ctx.lineTo(this.x + 50, this.y + 15);
      ctx.lineTo(this.x + 55, this.y + 20);
      ctx.closePath();
      ctx.fill();

      return; // Skip regular enemy drawing
    }
    
    // Main body (rounded rectangle)
    ctx.beginPath();
    ctx.roundRect(this.x + 18, this.y + 18, 24, 24, 8);
    ctx.fill();
    
    // Wings with arcade-style animation
    const wingOffset = Math.sin(Date.now() / 100) * 3;
    ctx.beginPath();
    ctx.ellipse(this.x + 15, this.y + 30 + wingOffset, 4, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(this.x + 45, this.y + 30 + wingOffset, 4, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Draw legs
    const legOffset = Math.sin(Date.now() / 150) * 2;
    ctx.beginPath();
    ctx.roundRect(this.x + 24, this.y + 42, 3, 10 + legOffset, 1.5);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(this.x + 33, this.y + 42, 3, 10 - legOffset, 1.5);
    ctx.fill();

    // Draw rider
    ctx.fillStyle = this.config.riderColor; // Dark red for enemy rider
    // Head (rounded)
    ctx.beginPath();
    ctx.roundRect(this.x + 24, this.y + 8, 12, 12, 4);
    ctx.fill();
    // Body (rounded)
    ctx.beginPath();
    ctx.roundRect(this.x + 26, this.y + 20, 8, 16, 3);
    ctx.fill();

    // Draw lance in arcade style
    ctx.fillStyle = '#FF0000';
    ctx.beginPath();
    if (this.facingRight) {
      ctx.roundRect(this.x + 42, this.y + 30, 18, 3, 1.5);
    } else {
      ctx.roundRect(this.x, this.y + 30, 18, 3, 1.5);
    }
    ctx.fill();
  }

  reset(canvas: HTMLCanvasElement) {
    this.x = Math.random() * (canvas.width - this.width);
    this.y = 50; // Start from top of screen
    this.velocityX = Math.random() > 0.5 ? 2 : -2;
    this.facingRight = this.velocityX > 0;
    this.velocityY = 1; // Start with downward momentum
    this.lastJumpTime = Date.now();
  }
}