import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';
import { overlaps } from '../../kit/util';

const W = 640;
const H = 360;
const TOP = 40;
const BOTTOM = 320;

interface Spike { x: number; w: number; ceiling: boolean }

class GravityFlip extends CanvasGame {
  private y = BOTTOM - 24;
  private vy = 0;
  private gravity = 1;
  private spikes: Spike[] = [];
  private spawnX = 0;
  private speed = 300;
  private distance = 0;

  constructor(host: GameHost) {
    super(host, { width: W, height: H, background: '#09090b' });
  }

  protected reset() {
    this.y = BOTTOM - 24;
    this.vy = 0;
    this.gravity = 1;
    this.spikes = [];
    this.spawnX = W + 100;
    this.speed = 300;
    this.distance = 0;
  }

  protected update(dt: number) {
    if (this.input.action()) {
      this.gravity *= -1;
      this.sfx.beep(this.gravity > 0 ? 300 : 600, 0.05, 'sine', 0.04);
    }
    this.vy += 2400 * this.gravity * dt;
    this.y += this.vy * dt;
    if (this.y > BOTTOM - 24) {
      this.y = BOTTOM - 24;
      this.vy = 0;
    }
    if (this.y < TOP) {
      this.y = TOP;
      this.vy = 0;
    }
    this.speed = 300 + Math.min(300, this.time * 5);
    this.distance += this.speed * dt;
    this.setScore(this.distance / 10);
    this.spawnX -= this.speed * dt;
    while (this.spawnX < W + 40) {
      // Alternate surfaces with a fair gap so a single flip always escapes.
      const ceiling = this.random() < 0.5;
      const w = 30 + this.random() * 60;
      this.spikes.push({ x: this.spawnX, w, ceiling });
      this.spawnX += w + 170 + this.random() * 150 - Math.min(80, this.time);
    }
    const me = { x: 100, y: this.y, w: 22, h: 24 };
    for (const s of this.spikes) {
      s.x -= this.speed * dt;
      const box = s.ceiling ? { x: s.x + 4, y: TOP, w: s.w - 8, h: 22 } : { x: s.x + 4, y: BOTTOM - 22, w: s.w - 8, h: 22 };
      if (overlaps(me, box)) {
        this.sfx.bad();
        this.end('lost', { metres: Math.round(this.distance / 10) });
        return;
      }
    }
    this.spikes = this.spikes.filter((s) => s.x > -100);
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#27272a';
    ctx.fillRect(0, 0, W, TOP);
    ctx.fillRect(0, BOTTOM, W, H - BOTTOM);
    ctx.fillStyle = '#e11d48';
    for (const s of this.spikes) {
      const n = Math.max(1, Math.floor(s.w / 14));
      for (let k = 0; k < n; k++) {
        const x = s.x + (k * s.w) / n;
        const w = s.w / n;
        ctx.beginPath();
        if (s.ceiling) {
          ctx.moveTo(x, TOP);
          ctx.lineTo(x + w / 2, TOP + 22);
          ctx.lineTo(x + w, TOP);
        } else {
          ctx.moveTo(x, BOTTOM);
          ctx.lineTo(x + w / 2, BOTTOM - 22);
          ctx.lineTo(x + w, BOTTOM);
        }
        ctx.fill();
      }
    }
    this.glow(ctx, '#a3e635', 14);
    this.roundRect(ctx, 100, this.y, 22, 24, 5, '#a3e635');
    this.noGlow(ctx);
    this.hud(ctx, `${Math.round(this.distance / 10)} m`, '');
    if (this.time < 3) this.text(ctx, 'Space / tap flips gravity', W / 2, H / 2, { size: 18, align: 'center', color: '#e4e4e7' });
  }
}

export default defineGame(
  { key: 'gravity-flip', engine: 'CANVAS', aspectRatio: W / H, orientation: 'landscape', maxScore: 2_000_000, controls: [{ action: 'Flip gravity', keys: 'Space / ↑ / tap' }] },
  (host) => new GravityFlip(host),
);
