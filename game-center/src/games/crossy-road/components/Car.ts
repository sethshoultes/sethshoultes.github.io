export default class Car {
  x: number;
  y: number;
  size: number;
  speed: number;
  direction: number;
  color: string;
  width: number;
  height: number;

  constructor(y: number, speed: number, direction: number, settings: any) {
    this.y = y;
    this.speed = speed;
    this.direction = direction;
    this.size = settings.carSize;
    this.width = this.size;
    this.height = this.size/2;
    this.x = direction > 0 ? -this.size : window.innerWidth;
    this.color = settings.carColor;
  }

  update() {
    this.x += this.speed * this.direction;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = this.color;
    
    // Enhanced car design
    ctx.fillRect(this.x, this.y, this.width, this.height);
    
    // Windows and details
    ctx.fillStyle = '#000000';
    const windowSize = this.size * 0.2;
    const wheelSize = this.size * 0.15;

    // Windows position based on direction
    if (this.direction > 0) {
      ctx.fillRect(this.x + this.width * 0.7, this.y + 2, windowSize, windowSize);
    } else {
      ctx.fillRect(this.x + this.width * 0.1, this.y + 2, windowSize, windowSize);
    }

    // Wheels
    ctx.fillRect(this.x + this.width * 0.1, this.y + this.height - 2, wheelSize, wheelSize);
    ctx.fillRect(this.x + this.width * 0.7, this.y + this.height - 2, wheelSize, wheelSize);

    // Headlights
    ctx.fillStyle = '#fbbf24';
    const headlightSize = this.size * 0.1;
    if (this.direction > 0) {
      ctx.fillRect(this.x + this.width - headlightSize, this.y + this.height * 0.3, headlightSize, headlightSize);
    } else {
      ctx.fillRect(this.x, this.y + this.height * 0.3, headlightSize, headlightSize);
    }
  }

  isOffScreen() {
    return this.direction > 0 ? 
      this.x > window.innerWidth : 
      this.x + this.width < 0;
  }
}