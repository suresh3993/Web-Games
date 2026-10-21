import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';

const W = 400;
const H = 640;
const BOUNCE = -720;

interface Plat { x: number; y: number; w: number; kind: 'normal' | 'spring' | 'crumble' | 'moving'; dir: number; gone: boolean }

class TowerClimb extends CanvasGame {
  private x = W / 2;
  private y = H - 80;
  private vx = 0;
  private vy = BOUNCE;
  private plats: Plat[] = [];
  private camY = 0;
  private highest = 0;
  private nextY = 0;

  constructor(host: GameHost) {
    super(host, { width: W, height: H, background: '#0f172a' });
  }

  protected reset() {
    this.x = W / 2;
    this.y = H - 80;
    this.vx = 0;
    this.vy = BOUNCE;
    this.camY = 0;
    this.highest = 0;
    this.plats = [{ x: W / 2 - 40, y: H - 40, w: 80, kind: 'normal', dir: 1, gone: false }];
    this.nextY = H - 120;
    this.fill();
  }

  /** Keeps platforms generated above the view. Gaps stay within jump height (~140 px). */
  private fill() {
    while (this.nextY > this.camY - 200) {
      const height = Math.max(0, -this.nextY);
      const roll = this.random();
      const kind: Plat['kind'] = roll < 0.08 ? 'spring' : roll < 0.08 + Math.min(0.2, height / 20000) ? 'crumble' : roll < 0.35 ? 'moving' : 'normal';
      this.plats.push({ x: this.random() * (W - 70), y: this.nextY, w: 64, kind, dir: this.random() < 0.5 ? -1 : 1, gone: false });
      this.nextY -= 60 + this.random() * Math.min(70, 30 + height / 200);
    }
  }

  protected update(dt: number) {
    const i = this.input;
    let steer = (i.right ? 1 : 0) - (i.left ? 1 : 0);
    if (i.pointer.down) steer = i.pointer.x < W / 2 ? -1 : 1;
    this.vx = steer * 320;
    this.x += this.vx * dt;
    if (this.x < -10) this.x = W + 10;
    if (this.x > W + 10) this.x = -10;
    const prevY = this.y;
    this.vy += 1500 * dt;
    this.y += this.vy * dt;
    for (const p of this.plats) {
      if (p.kind === 'moving') {
        p.x += p.dir * 80 * dt;
        if (p.x < 0 || p.x > W - p.w) p.dir *= -1;
      }
      if (p.gone || this.vy <= 0) continue;
      if (prevY <= p.y && this.y >= p.y && this.x > p.x - 8 && this.x < p.x + p.w + 8) {
        this.y = p.y;
        this.vy = p.kind === 'spring' ? BOUNCE * 1.6 : BOUNCE;
        if (p.kind === 'crumble') p.gone = true;
        this.sfx.beep(p.kind === 'spring' ? 880 : 520, 0.04, 'triangle', 0.04);
      }
    }
    const screenY = this.y - this.camY;
    if (screenY < H * 0.4) this.camY = this.y - H * 0.4;
    this.highest = Math.max(this.highest, H - 80 - this.y);
    this.setScore(this.highest / 2);
    this.fill();
    this.plats = this.plats.filter((p) => p.y < this.camY + H + 40);
    if (this.y - this.camY > H + 40) {
      this.sfx.bad();
      this.end('lost', { height: Math.round(this.highest / 10) });
    }
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(0, -this.camY);
    for (const p of this.plats) {
      if (p.gone) continue;
      const color = p.kind === 'spring' ? '#facc15' : p.kind === 'crumble' ? '#a16207' : p.kind === 'moving' ? '#60a5fa' : '#4ade80';
      this.roundRect(ctx, p.x, p.y, p.w, 10, 5, color);
      if (p.kind === 'spring') this.roundRect(ctx, p.x + p.w / 2 - 8, p.y - 8, 16, 8, 2, '#f8fafc');
    }
    this.glow(ctx, '#f472b6', 12);
    this.roundRect(ctx, this.x - 12, this.y - 26, 24, 26, 8, '#f472b6');
    this.noGlow(ctx);
    ctx.restore();
    this.hud(ctx, `Height ${Math.round(this.highest / 10)} m`, `Score ${this.score}`);
    if (this.time < 4) this.text(ctx, '← → (or hold a side) to steer. Edges wrap around!', W / 2, H - 20, { size: 13, align: 'center', color: '#c7d2fe', font: 'body' });
  }
}

export default defineGame(
  { key: 'tower-climb', engine: 'CANVAS', aspectRatio: W / H, orientation: 'portrait', maxScore: 5_000_000, controls: [{ action: 'Steer', keys: '← → / hold a screen side' }] },
  (host) => new TowerClimb(host),
);
