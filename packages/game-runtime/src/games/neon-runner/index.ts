import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';
import { overlaps } from '../../kit/util';

const W = 640;
const H = 360;
const GROUND = 300;

interface Obstacle { x: number; w: number; h: number; high: boolean }
interface Cell { x: number; y: number }

class NeonRunner extends CanvasGame {
  private y = GROUND;
  private vy = 0;
  private sliding = 0;
  private obstacles: Obstacle[] = [];
  private cells: Cell[] = [];
  private speed = 320;
  private spawn = 0;
  private invincible = 0;
  private distance = 0;
  private skyline: { x: number; w: number; h: number }[] = [];

  constructor(host: GameHost) {
    super(host, { width: W, height: H, background: '#0d0221' });
  }

  protected reset() {
    this.y = GROUND;
    this.vy = 0;
    this.sliding = 0;
    this.obstacles = [];
    this.cells = [];
    this.speed = 320;
    this.spawn = 1;
    this.invincible = 0;
    this.distance = 0;
    this.skyline = Array.from({ length: 12 }, (_, k) => ({ x: k * 70, w: 50 + this.random() * 30, h: 60 + this.random() * 120 }));
  }

  protected update(dt: number) {
    const i = this.input;
    const onGround = this.y >= GROUND;
    if ((i.anyHit('Space', 'ArrowUp', 'KeyW') || i.swipe === 'up' || (i.taps.length && !i.swipe)) && onGround) {
      this.vy = -640;
      this.sfx.beep(600, 0.05, 'sine', 0.04);
    }
    if ((i.anyHit('ArrowDown', 'KeyS') || i.swipe === 'down') && onGround) this.sliding = 0.6;
    this.sliding = Math.max(0, this.sliding - dt);
    this.vy += 1900 * dt;
    this.y = Math.min(GROUND, this.y + this.vy * dt);
    if (this.y >= GROUND) this.vy = 0;
    this.speed = 320 + Math.min(380, this.time * 6);
    this.distance += this.speed * dt;
    this.setScore(this.distance / 10 + this.cellsCollected * 30);
    this.invincible = Math.max(0, this.invincible - dt);
    for (const b of this.skyline) {
      b.x -= this.speed * 0.2 * dt;
      if (b.x < -80) b.x += 12 * 70;
    }
    this.spawn -= dt;
    if (this.spawn <= 0) {
      this.spawn = Math.max(0.65, 1.4 - this.time * 0.01) + this.random() * 0.5;
      const high = this.random() < 0.35;
      this.obstacles.push({ x: W + 20, w: high ? 40 : 26 + this.random() * 20, h: high ? 30 : 30 + this.random() * 26, high });
      if (this.random() < 0.3) this.cells.push({ x: W + 160, y: GROUND - 90 });
    }
    const runnerH = this.sliding ? 22 : 44;
    const me = { x: 90, y: this.y - runnerH, w: 26, h: runnerH };
    for (const o of this.obstacles) {
      o.x -= this.speed * dt;
      const box = o.high ? { x: o.x, y: GROUND - 74, w: o.w, h: o.h } : { x: o.x, y: GROUND - o.h, w: o.w, h: o.h };
      if (overlaps(me, box) && this.invincible === 0) {
        this.sfx.bad();
        this.end('lost', { metres: Math.round(this.distance / 10) });
        return;
      }
    }
    for (const c of this.cells) {
      c.x -= this.speed * dt;
      if (overlaps(me, { x: c.x - 10, y: c.y - 10, w: 20, h: 20 })) {
        c.x = -100;
        this.cellsCollected++;
        this.invincible = 3;
        this.sfx.good();
      }
    }
    this.obstacles = this.obstacles.filter((o) => o.x > -60);
    this.cells = this.cells.filter((c) => c.x > -40);
  }
  private cellsCollected = 0;

  protected draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#1e0a3c';
    for (const b of this.skyline) ctx.fillRect(b.x, GROUND - b.h, b.w, b.h);
    ctx.fillStyle = '#ff2fd0';
    ctx.fillRect(0, GROUND, W, 3);
    for (const o of this.obstacles) {
      this.glow(ctx, '#f43f5e', 12);
      if (o.high) this.roundRect(ctx, o.x, GROUND - 74, o.w, o.h, 4, '#f43f5e');
      else this.roundRect(ctx, o.x, GROUND - o.h, o.w, o.h, 4, '#fb7185');
    }
    for (const c of this.cells) {
      this.glow(ctx, '#facc15', 14);
      this.circle(ctx, c.x, c.y, 9, '#facc15');
    }
    this.noGlow(ctx);
    const h = this.sliding ? 22 : 44;
    const color = this.invincible > 0 ? '#facc15' : '#22d3ee';
    this.glow(ctx, color, 16);
    this.roundRect(ctx, 90, this.y - h, 26, h, 6, color);
    this.noGlow(ctx);
    this.hud(ctx, `${Math.round(this.distance / 10)} m`, this.invincible > 0 ? `⚡ ${this.invincible.toFixed(1)}s` : '');
    if (this.time < 4) this.text(ctx, 'Jump: Space / ↑ / tap · Slide: ↓ / swipe down', W / 2, H - 20, { size: 14, align: 'center', color: '#f0abfc', font: 'body' });
  }
}

export default defineGame(
  { key: 'neon-runner', engine: 'CANVAS', aspectRatio: W / H, orientation: 'landscape', maxScore: 2_000_000, controls: [{ action: 'Jump', keys: 'Space / ↑ / tap' }, { action: 'Slide', keys: '↓ / swipe down' }] },
  (host) => new NeonRunner(host),
);
