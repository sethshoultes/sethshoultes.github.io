import { GameSettings } from './GameSettings';

export class Platform {
  x: number;
  y: number;
  width: number;
  height: number;

  constructor(x: number, y: number, width: number) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = GameSettings.PLATFORM.HEIGHT;
  }

  draw(ctx: CanvasRenderingContext2D) {
    // Draw platform in minimalist style
    ctx.fillStyle = GameSettings.PLATFORM.COLORS.BASE;
    ctx.beginPath();
    ctx.roundRect(this.x, this.y, this.width, this.height, 4);
    ctx.fill();
    
    // Add white center section
    ctx.fillStyle = GameSettings.PLATFORM.COLORS.CENTER;
    ctx.beginPath();
    ctx.roundRect(this.x + this.width * 0.2, this.y + 2, this.width * 0.6, 8, 2);
    ctx.fill();
    
    // Add subtle decorative elements
    ctx.fillStyle = GameSettings.PLATFORM.COLORS.DOTS;
    for (let i = 0; i < this.width; i += 20) {
      ctx.beginPath();
      ctx.arc(this.x + i + 2, this.y + this.height - 2, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}