export default class Character {
  x: number;
  y: number;
  size: number;
  color: string;
  isAlive: boolean;

  constructor(x: number, y: number, settings: any) {
    this.x = x;
    this.y = y;
    this.size = settings.characterSize;
    this.color = settings.characterColor;
    this.isAlive = true;
  }

  draw(ctx: CanvasRenderingContext2D) {
    // Draw character body
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, this.size, this.size);
    
    // Draw face details
    ctx.fillStyle = '#ef4444'; // Red comb
    ctx.fillRect(this.x + this.size * 0.7, this.y + this.size * 0.1, this.size * 0.2, this.size * 0.2);
    
    ctx.fillStyle = '#000'; // Eye
    ctx.fillRect(this.x + this.size * 0.2, this.y + this.size * 0.3, this.size * 0.15, this.size * 0.15);
  }

  move(dx: number, dy: number, gameWidth: number, gameHeight: number) {
    const newX = this.x + dx * this.size;
    const newY = this.y + dy * this.size;

    if (newX >= 0 && newX + this.size <= gameWidth) {
      this.x = newX;
    }
    if (newY >= 0 && newY + this.size <= gameHeight) {
      this.y = newY;
    }
  }
}