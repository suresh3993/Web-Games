import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';
import { circleRect } from '../../kit/util';

const W = 400;
const H = 600;
const GAP = 160;
const PIPE_W = 64;

interface Pipe { x: number; gapY: number; passed: boolean }

class SkyHopper extends CanvasGame {
  private bird = { y: H / 2, vy: 0 };
  private pipes: Pipe[] = [];
  private spawnX = 0;
  private started = false;
  private clouds: { x: number; y: number; s: number }[] = [];

  constructor(host: GameHost) {
    super(host, { width: W, height: H, background: '#0b1636' });
  }

  protected reset() {
    this.bird = { y: H / 2, vy: 0 };
    this.pipes = [];
    this.spawnX = 0;
    this.started = false;
    this.clouds = Array.from({ length: 6 }, () => ({ x: this.random() * W, y: 40 + this.random() * 300, s: 10 + this.random() * 20 }));
  }

  private speed() {
    return 150 + Math.min(90, this.score * 3);
  }

  protected update(dt: number) {
    if (this.input.action()) {
      this.started = true;
      this.bird.vy = -330;
      this.sfx.beep(520, 0.05, 'sine', 0.04);
    }
    for (const c of this.clouds) {
      c.x -= c.s * dt;
      if (c.x < -60) c.x = W + 60;
    }
    if (!this.started) {
      this.bird.y = H / 2 + Math.sin(this.time * 3) * 8;
      return;
    }
    this.bird.vy = Math.min(560, this.bird.vy + 980 * dt);
    this.bird.y += this.bird.vy * dt;
    const sp = this.speed();
    this.spawnX -= sp * dt;
    if (this.spawnX <= 0) {
      this.pipes.push({ x: W + PIPE_W, gapY: 120 + this.random() * (H - 260), passed: false });
      this.spawnX = 230;
    }
    for (const p of this.pipes) {
      p.x -= sp * dt;
      if (!p.passed && p.x + PIPE_W < 90) {
        p.passed = true;
        this.addScore(1);
        this.sfx.good();
      }
      const top = { x: p.x, y: 0, w: PIPE_W, h: p.gapY - GAP / 2 };
      const bottom = { x: p.x, y: p.gapY + GAP / 2, w: PIPE_W, h: H };
      if (circleRect(100, this.bird.y, 13, top) || circleRect(100, this.bird.y, 13, bottom)) {
        this.sfx.bad();
        this.end('lost', { pipes: this.score });
        return;
      }
    }
    this.pipes = this.pipes.filter((p) => p.x > -PIPE_W - 10);
    if (this.bird.y > H - 30 || this.bird.y < -40) {
      this.sfx.bad();
      this.end('lost', { pipes: this.score });
    }
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    for (const c of this.clouds) {
      ctx.globalAlpha = 0.15;
      this.circle(ctx, c.x, c.y, 30, '#c7d2fe');
      this.circle(ctx, c.x + 26, c.y + 6, 22, '#c7d2fe');
    }
    ctx.globalAlpha = 1;
    for (const p of this.pipes) {
      this.roundRect(ctx, p.x, -10, PIPE_W, p.gapY - GAP / 2 + 10, 8, '#16a34a');
      this.roundRect(ctx, p.x, p.gapY + GAP / 2, PIPE_W, H, 8, '#16a34a');
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(p.x - 4, p.gapY - GAP / 2 - 18, PIPE_W + 8, 18);
      ctx.fillRect(p.x - 4, p.gapY + GAP / 2, PIPE_W + 8, 18);
    }
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(0, H - 30, W, 30);
    const tilt = Math.max(-0.5, Math.min(1.2, this.bird.vy / 500));
    ctx.save();
    ctx.translate(100, this.bird.y);
    ctx.rotate(tilt);
    this.glow(ctx, '#facc15', 10);
    this.circle(ctx, 0, 0, 14, '#facc15');
    this.noGlow(ctx);
    this.circle(ctx, 6, -4, 4, '#fff');
    this.circle(ctx, 7, -4, 2, '#111');
    ctx.fillStyle = '#fb923c';
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(22, 3);
    ctx.lineTo(12, 6);
    ctx.fill();
    ctx.restore();
    this.text(ctx, String(this.score), W / 2, 70, { size: 48, align: 'center' });
    if (!this.started) this.text(ctx, 'Tap / Space to flap', W / 2, H / 2 + 70, { size: 18, align: 'center', color: '#c7d2fe', font: 'body' });
  }
}

export default defineGame(
  {
    key: 'sky-hopper',
    engine: 'CANVAS',
    aspectRatio: W / H,
    orientation: 'portrait',
    maxScore: 10_000,
    scoreLabel: 'Gaps',
    controls: [{ action: 'Flap', keys: 'Space / ↑ / click / tap' }],
  },
  (host) => new SkyHopper(host),
);
