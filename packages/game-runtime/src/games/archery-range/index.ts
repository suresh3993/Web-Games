import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';
import { clamp } from '../../kit/util';

const W = 640;
const H = 400;
const ARROWS = 10;
const BOW = { x: 70, y: 280 };
const RING_COLORS = ['#facc15', '#facc15', '#ef4444', '#ef4444', '#3b82f6', '#3b82f6', '#0f172a', '#0f172a', '#f8fafc', '#f8fafc'];

class ArcheryRange extends CanvasGame {
  private arrowsLeft = ARROWS;
  private drawing = false;
  private power = 0;
  private aim = -0.2;
  private arrow: { x: number; y: number; vx: number; vy: number } | null = null;
  private target = { x: 540, y: 250, r: 70 };
  private wind = 0;
  private hits: { dx: number; dy: number }[] = [];
  private lastPoints = -1;

  constructor(host: GameHost) {
    super(host, { width: W, height: H, background: '#0c1a3a' });
  }

  protected reset() {
    this.arrowsLeft = ARROWS;
    this.arrow = null;
    this.hits = [];
    this.lastPoints = -1;
    this.newWind();
  }

  private newWind() {
    this.wind = Math.round((this.random() - 0.5) * 40 * (1 + (ARROWS - this.arrowsLeft) / 5));
  }

  protected update(dt: number) {
    const i = this.input;
    // Later arrows: the target moves.
    if (this.arrowsLeft <= 4) this.target.y = 250 + Math.sin(this.time * 1.3) * 70;
    if (!this.arrow) {
      if (i.pointer.down || i.key('Space')) {
        this.drawing = true;
        this.power = Math.min(1, this.power + dt * 0.8);
      }
      if (i.pointer.down) this.aim = clamp(Math.atan2(i.pointer.y - BOW.y, i.pointer.x - BOW.x), -0.9, 0.4);
      if (i.up) this.aim = clamp(this.aim - dt, -0.9, 0.4);
      if (i.down) this.aim = clamp(this.aim + dt, -0.9, 0.4);
      if (this.drawing && !i.pointer.down && !i.key('Space')) {
        const v = 420 + this.power * 520;
        this.arrow = { x: BOW.x, y: BOW.y, vx: Math.cos(this.aim) * v, vy: Math.sin(this.aim) * v };
        this.drawing = false;
        this.power = 0;
        this.arrowsLeft--;
        this.sfx.beep(500, 0.06, 'triangle');
      }
      return;
    }
    const a = this.arrow;
    a.vy += 300 * dt;
    a.vx += this.wind * dt * 2;
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    if (a.x >= this.target.x - 6) {
      const dy = a.y - this.target.y;
      const ring = Math.floor((Math.abs(dy) / this.target.r) * 10);
      const points = Math.abs(dy) <= this.target.r ? 10 - ring : 0;
      this.lastPoints = points;
      if (points) {
        this.hits.push({ dx: 0, dy });
        this.addScore(points * 10);
        this.sfx[points >= 9 ? 'win' : 'good']();
      } else this.sfx.bad();
      this.arrow = null;
      this.newWind();
    } else if (a.y > H || a.x > W) {
      this.lastPoints = 0;
      this.arrow = null;
      this.newWind();
    }
    if (!this.arrow && this.arrowsLeft <= 0) this.end('completed', { hits: this.hits.length });
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#14532d';
    ctx.fillRect(0, H - 40, W, 40);
    const t = this.target;
    for (let k = 0; k < 10; k++) {
      const r = t.r * (1 - k / 10);
      ctx.fillStyle = RING_COLORS[9 - k]!;
      ctx.beginPath();
      ctx.ellipse(t.x, t.y, r * 0.25, r, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const h of this.hits) this.circle(ctx, t.x, t.y + h.dy, 3, '#22d3ee');
    // Bow
    ctx.strokeStyle = '#a16207';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(BOW.x, BOW.y, 40, this.aim - 1.2, this.aim + 1.2);
    ctx.stroke();
    if (!this.arrow) {
      const pull = 10 + this.power * 26;
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(BOW.x - Math.cos(this.aim) * pull, BOW.y - Math.sin(this.aim) * pull);
      ctx.lineTo(BOW.x + Math.cos(this.aim) * 40, BOW.y + Math.sin(this.aim) * 40);
      ctx.stroke();
    } else {
      const ang = Math.atan2(this.arrow.vy, this.arrow.vx);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(this.arrow.x - Math.cos(ang) * 30, this.arrow.y - Math.sin(ang) * 30);
      ctx.lineTo(this.arrow.x, this.arrow.y);
      ctx.stroke();
    }
    this.hud(ctx, `Score ${this.score}  ·  Arrows ${this.arrowsLeft}`, `Wind ${this.wind > 0 ? '→' : this.wind < 0 ? '←' : ''} ${Math.abs(this.wind)}`);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(12, 36, 120, 8);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(12, 36, this.power * 120, 8);
    if (this.lastPoints >= 0 && !this.arrow) this.text(ctx, this.lastPoints ? `${this.lastPoints}!` : 'Miss', W / 2, 70, { size: 26, align: 'center', color: this.lastPoints ? '#facc15' : '#fb7185' });
    if (this.time < 4) this.text(ctx, 'Hold to draw, aim with the pointer (or ↑↓ + Space), release to shoot', W / 2, H - 14, { size: 12, align: 'center', color: '#e2e8f0', font: 'body' });
  }
}

export default defineGame(
  { key: 'archery-range', engine: 'CANVAS', aspectRatio: W / H, orientation: 'landscape', maxScore: ARROWS * 100, controls: [{ action: 'Draw & release', keys: 'Hold mouse / Space' }, { action: 'Aim', keys: 'Pointer / ↑ ↓' }] },
  (host) => new ArcheryRange(host),
);
