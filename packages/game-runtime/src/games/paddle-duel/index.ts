import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';
import { clamp } from '../../kit/util';

const W = 640;
const H = 400;
const PH = 70;
const TARGET = 7;

type Mode = 'menu' | 'cpu' | '2p';

class PaddleDuel extends CanvasGame {
  private mode: Mode = 'menu';
  private left = H / 2;
  private right = H / 2;
  private ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
  private scores = [0, 0];
  private serveTimer = 0;
  private rally = 0;

  private readonly cpuButton = { x: W / 2 - 150, y: 200, w: 140, h: 48 };
  private readonly duoButton = { x: W / 2 + 10, y: 200, w: 140, h: 48 };

  constructor(host: GameHost) {
    super(host, { width: W, height: H });
  }

  protected reset() {
    this.mode = 'menu';
    this.scores = [0, 0];
    this.left = this.right = H / 2;
    this.resetBall(1);
  }

  private resetBall(dir: number) {
    this.ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
    this.serveTimer = 0.8;
    this.rally = 0;
    this.serveDir = dir;
  }
  private serveDir = 1;

  protected update(dt: number) {
    const i = this.input;
    if (this.mode === 'menu') {
      if (this.tapped(this.cpuButton) || i.hit('Digit1')) this.mode = 'cpu';
      else if (this.tapped(this.duoButton) || i.hit('Digit2')) this.mode = '2p';
      return;
    }
    const speed = 380;
    // Left paddle: W/S, or pointer/touch on the left half (or anywhere vs CPU).
    if (i.key('KeyW')) this.left -= speed * dt;
    if (i.key('KeyS')) this.left += speed * dt;
    if (i.pointer.down && (this.mode === 'cpu' || i.pointer.x < W / 2)) this.left = i.pointer.y;
    if (this.mode === 'cpu') {
      if (i.key('ArrowUp')) this.left -= speed * dt;
      if (i.key('ArrowDown')) this.left += speed * dt;
      // CPU: tracks the ball with limited speed and a reaction lag.
      const target = this.ball.vx > 0 ? this.ball.y : H / 2;
      const cpuSpeed = 230 + this.rally * 6;
      this.right += clamp(target - this.right, -cpuSpeed * dt, cpuSpeed * dt);
    } else {
      if (i.key('ArrowUp')) this.right -= speed * dt;
      if (i.key('ArrowDown')) this.right += speed * dt;
      if (i.pointer.down && i.pointer.x >= W / 2) this.right = i.pointer.y;
    }
    this.left = clamp(this.left, PH / 2, H - PH / 2);
    this.right = clamp(this.right, PH / 2, H - PH / 2);

    if (this.serveTimer > 0) {
      this.serveTimer -= dt;
      if (this.serveTimer <= 0) {
        const angle = (this.random() - 0.5) * 0.8;
        this.ball.vx = Math.cos(angle) * 300 * this.serveDir;
        this.ball.vy = Math.sin(angle) * 300;
      }
      return;
    }

    const b = this.ball;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y < 8 || b.y > H - 8) {
      b.vy *= -1;
      b.y = clamp(b.y, 8, H - 8);
    }
    const hit = (paddleY: number, paddleX: number, dirOut: number) => {
      if (Math.abs(b.y - paddleY) < PH / 2 + 8 && Math.abs(b.x - paddleX) < 14 && Math.sign(b.vx) !== dirOut) {
        const offset = (b.y - paddleY) / (PH / 2);
        const sp = Math.min(760, Math.hypot(b.vx, b.vy) * 1.06);
        const angle = offset * 0.9;
        b.vx = Math.cos(angle) * sp * dirOut;
        b.vy = Math.sin(angle) * sp;
        this.rally++;
        this.sfx.click();
      }
    };
    hit(this.left, 30, 1);
    hit(this.right, W - 30, -1);
    if (b.x < -10 || b.x > W + 10) {
      const scorer = b.x < 0 ? 1 : 0;
      this.scores[scorer]!++;
      if (this.mode === 'cpu') this.sfx[scorer === 0 ? 'good' : 'bad']();
      if (this.scores[scorer]! >= TARGET) {
        if (this.mode === 'cpu') {
          const won = this.scores[0]! > this.scores[1]!;
          this.setScore(won ? 200 + (this.scores[0]! - this.scores[1]!) * 40 : this.scores[0]! * 10);
          this.end(won ? 'won' : 'lost', { for: this.scores[0]!, against: this.scores[1]! });
        } else this.end('completed');
        return;
      }
      this.resetBall(scorer === 0 ? 1 : -1);
    }
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = 'rgba(148,163,255,0.25)';
    ctx.setLineDash([8, 10]);
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.setLineDash([]);
    if (this.mode === 'menu') {
      this.text(ctx, 'PADDLE DUEL', W / 2, 130, { size: 40, align: 'center', color: '#a78bfa' });
      this.text(ctx, `First to ${TARGET} wins`, W / 2, 170, { size: 16, align: 'center', color: '#9aa0c0', font: 'body' });
      this.button(ctx, this.cpuButton, '1 · vs CPU', true);
      this.button(ctx, this.duoButton, '2 · 2 Players');
      this.text(ctx, 'Left: W/S or drag · Right: ↑/↓ or drag', W / 2, 300, { size: 13, align: 'center', color: '#9aa0c0', font: 'body' });
      return;
    }
    this.text(ctx, String(this.scores[0]), W / 2 - 60, 60, { size: 48, align: 'center', color: '#22d3ee' });
    this.text(ctx, String(this.scores[1]), W / 2 + 60, 60, { size: 48, align: 'center', color: '#f472b6' });
    this.glow(ctx, '#22d3ee');
    this.roundRect(ctx, 22, this.left - PH / 2, 10, PH, 5, '#22d3ee');
    this.glow(ctx, '#f472b6');
    this.roundRect(ctx, W - 32, this.right - PH / 2, 10, PH, 5, '#f472b6');
    this.glow(ctx, '#ffffff');
    this.circle(ctx, this.ball.x, this.ball.y, 8, '#f8fafc');
    this.noGlow(ctx);
    if (this.mode === 'cpu') this.text(ctx, 'YOU', 40, H - 14, { size: 12, color: '#9aa0c0' });
  }
}

export default defineGame(
  {
    key: 'paddle-duel',
    engine: 'CANVAS',
    aspectRatio: W / H,
    orientation: 'landscape',
    maxScore: 200 + TARGET * 40,
    controls: [
      { action: 'Left paddle', keys: 'W / S or drag (vs CPU: ↑ ↓ too)' },
      { action: 'Right paddle (2P)', keys: '↑ / ↓ or drag right half' },
    ],
  },
  (host) => new PaddleDuel(host),
);
