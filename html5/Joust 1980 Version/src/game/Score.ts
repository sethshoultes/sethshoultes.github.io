import { GameSettings } from './GameSettings';

export class Score {
  private score: number;
  private lives: number;
  private kills: number;

  constructor() {
    this.score = 0;
    this.lives = GameSettings.SCORE.INITIAL_LIVES;
    this.kills = 0;
  }

  addPoints(points: number) {
    this.score = Math.max(0, this.score + points);
  }

  addKill() {
    this.kills++;
  }

  loseLife() {
    this.lives--;
  }
  
  addLife() {
    this.lives++;
  }

  getLives(): number {
    return this.lives;
  }

  getScore(): number {
    return this.score;
  }

  getKills(): number {
    return this.kills;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.font = GameSettings.SCORE.FONT;
    ctx.fillStyle = GameSettings.SCORE.COLOR;
    const text = `SCORE: ${this.score.toString().padStart(6, '0')}  LIVES: ${this.lives}  KILLS: ${this.kills}`;
    const metrics = ctx.measureText(text);
    const x = (ctx.canvas.width - metrics.width) / 2;
    ctx.fillText(
      text,
      x,
      GameSettings.SCORE.Y_POSITION
    );
  }
}