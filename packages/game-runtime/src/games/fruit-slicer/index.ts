import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';
import { closestPointOnSegment } from '../../kit/physics';

const W = 480;
const H = 640;
const FRUITS = [
  { color: '#ef4444', inner: '#fecaca', r: 26 },
  { color: '#f97316', inner: '#fed7aa', r: 24 },
  { color: '#22c55e', inner: '#bbf7d0', r: 30 },
  { color: '#a855f7', inner: '#e9d5ff', r: 20 },
  { color: '#eab308', inner: '#fef08a', r: 22 },
];

interface Thing { x: number; y: number; vx: number; vy: number; r: number; kind: number; bomb: boolean; sliced: boolean; spin: number }

class FruitSlicer extends CanvasGame {
  private things: Thing[] = [];
  private halves: { x: number; y: number; vx: number; vy: number; r: number; kind: number; side: number }[] = [];
  private trail: { x: number; y: number; t: number }[] = [];
  private lastPointer: { x: number; y: number } | null = null;
  private misses = 0;
  private spawn = 0;

  constructor(host: GameHost) {
    super(host, { width: W, height: H, background: '#1c0f05' });
  }

  protected reset() {
    this.things = [];
    this.halves = [];
    this.trail = [];
    this.misses = 0;
    this.spawn = 0.8;
  }

  private launch() {
    const burst = 1 + Math.floor(this.random() * Math.min(4, 1 + this.time / 15));
    for (let k = 0; k < burst; k++) {
      const bomb = this.random() < Math.min(0.25, 0.08 + this.time / 300);
      const x = 60 + this.random() * (W - 120);
      this.things.push({ x, y: H + 30, vx: (W / 2 - x) * 0.4 + (this.random() - 0.5) * 80, vy: -(620 + this.random() * 160), r: bomb ? 22 : FRUITS[0]!.r, kind: Math.floor(this.random() * FRUITS.length), bomb, sliced: false, spin: 0 });
    }
  }

  protected update(dt: number) {
    const i = this.input;
    this.spawn -= dt;
    if (this.spawn <= 0) {
      this.spawn = Math.max(0.6, 1.4 - this.time * 0.01);
      this.launch();
    }
    for (const t of this.things) {
      t.vy += 700 * dt;
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      t.spin += dt * 3;
    }
    // Blade: the segment between last and current pointer positions while held.
    const p = i.pointer;
    if (p.down && this.lastPointer) {
      const seg = { x1: this.lastPointer.x, y1: this.lastPointer.y, x2: p.x, y2: p.y };
      const moved = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
      if (moved > 4) {
        this.trail.push({ x: p.x, y: p.y, t: 0.18 });
        let sliced = 0;
        for (const t of this.things) {
          if (t.sliced) continue;
          const c = closestPointOnSegment(t.x, t.y, seg);
          const r = t.bomb ? 22 : FRUITS[t.kind]!.r;
          if (Math.hypot(c.x - t.x, c.y - t.y) > r) continue;
          t.sliced = true;
          if (t.bomb) {
            this.sfx.bad();
            this.end('lost', { score: this.score });
            return;
          }
          sliced++;
          for (const side of [-1, 1]) this.halves.push({ x: t.x, y: t.y, vx: t.vx + side * 80, vy: t.vy - 60, r, kind: t.kind, side });
        }
        if (sliced) {
          this.addScore(sliced * 10 + (sliced >= 3 ? sliced * 10 : 0));
          this.sfx.beep(700 + sliced * 80, 0.05, 'triangle');
        }
      }
    }
    this.lastPointer = p.down ? { x: p.x, y: p.y } : null;
    for (const t of this.things) {
      if (!t.sliced && !t.bomb && t.y > H + 40 && t.vy > 0) {
        t.sliced = true;
        this.misses++;
        this.sfx.bad();
        if (this.misses >= 3) {
          this.end('completed', { score: this.score });
          return;
        }
      }
    }
    this.things = this.things.filter((t) => !t.sliced && t.y < H + 60);
    for (const h of this.halves) {
      h.vy += 900 * dt;
      h.x += h.vx * dt;
      h.y += h.vy * dt;
    }
    this.halves = this.halves.filter((h) => h.y < H + 60);
    for (const tr of this.trail) tr.t -= dt;
    this.trail = this.trail.filter((tr) => tr.t > 0);
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    for (const t of this.things) {
      if (t.bomb) {
        this.circle(ctx, t.x, t.y, 22, '#111827');
        this.circle(ctx, t.x + 8, t.y - 20, 5, '#f97316');
        this.text(ctx, '✸', t.x, t.y + 6, { size: 16, align: 'center', color: '#ef4444' });
      } else {
        const f = FRUITS[t.kind]!;
        this.circle(ctx, t.x, t.y, f.r, f.color);
        this.circle(ctx, t.x - f.r / 3, t.y - f.r / 3, f.r / 4, 'rgba(255,255,255,0.35)');
      }
    }
    for (const h of this.halves) {
      const f = FRUITS[h.kind]!;
      ctx.fillStyle = f.inner;
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r, h.side > 0 ? -Math.PI / 2 : Math.PI / 2, h.side > 0 ? Math.PI / 2 : (Math.PI * 3) / 2);
      ctx.fill();
    }
    if (this.trail.length > 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      this.trail.forEach((tr, k) => (k ? ctx.lineTo(tr.x, tr.y) : ctx.moveTo(tr.x, tr.y)));
      ctx.stroke();
    }
    this.hud(ctx, `Score ${this.score}`, `${'✕'.repeat(this.misses)}${'·'.repeat(3 - this.misses)}`);
    if (this.time < 4) this.text(ctx, 'Swipe through fruit — avoid the bombs!', W / 2, H / 2, { size: 18, align: 'center', color: '#fde68a' });
  }
}

export default defineGame(
  { key: 'fruit-slicer', engine: 'CANVAS', aspectRatio: W / H, orientation: 'portrait', input: { keyboard: false, touch: true, pointer: true }, maxScore: 200_000, controls: [{ action: 'Slice', keys: 'Drag / swipe across fruit' }] },
  (host) => new FruitSlicer(host),
);
