export default class Obstacle {
  x: number;
  y: number;
  size: number;
  type: 'rock' | 'tree';
  color: string;

  constructor(x: number, y: number, size: number, type: 'rock' | 'tree') {
    this.x = x;
    this.y = y;
    this.size = size;
    this.type = type;
    this.color = type === 'rock' ? '#6b7280' : '#166534';
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.type === 'rock') {
      this.drawRock(ctx);
    } else {
      this.drawTree(ctx);
    }
  }

  private drawRock(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y + this.size);
    ctx.lineTo(this.x + this.size, this.y + this.size);
    ctx.lineTo(this.x + this.size * 0.8, this.y);
    ctx.lineTo(this.x + this.size * 0.2, this.y);
    ctx.closePath();
    ctx.fill();

    // Add some detail
    ctx.strokeStyle = '#4b5563';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.x + this.size * 0.3, this.y + this.size * 0.3);
    ctx.lineTo(this.x + this.size * 0.5, this.y + this.size * 0.5);
    ctx.stroke();
  }

  private drawTree(ctx: CanvasRenderingContext2D) {
    // Draw trunk
    ctx.fillStyle = '#92400e';
    ctx.fillRect(
      this.x + this.size * 0.4,
      this.y + this.size * 0.6,
      this.size * 0.2,
      this.size * 0.4
    );

    // Draw leaves
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.moveTo(this.x + this.size * 0.5, this.y);
    ctx.lineTo(this.x + this.size, this.y + this.size * 0.6);
    ctx.lineTo(this.x, this.y + this.size * 0.6);
    ctx.closePath();
    ctx.fill();
  }
}