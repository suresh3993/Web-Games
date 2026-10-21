import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';
import { clamp } from '../../kit/util';

const R = 18;
const COLS = 11;
const W = COLS * R * 2 + R;
const H = 640;
const ROW_H = R * Math.sqrt(3);
const DANGER_Y = H - 110;
const COLORS = ['#f43f5e', '#facc15', '#22d3ee', '#4ade80', '#a78bfa', '#fb923c'];
const SHOTS_PER_DESCENT = 7;

type Cell = { r: number; c: number };

class BubbleShooter extends CanvasGame {
  private grid = new Map<string, number>();
  private top = 50;
  private angle = -Math.PI / 2;
  private shot: { x: number; y: number; vx: number; vy: number; color: number } | null = null;
  private current = 0;
  private next = 0;
  private shots = 0;
  private falling: { x: number; y: number; vy: number; color: number }[] = [];

  constructor(host: GameHost) {
    super(host, { width: W, height: H });
  }

  protected reset() {
    this.grid.clear();
    this.top = 50;
    this.shots = 0;
    this.shot = null;
    this.falling = [];
    for (let r = 0; r < 6; r++) for (let c = 0; c < this.rowLen(r); c++) this.grid.set(`${r},${c}`, Math.floor(this.random() * 5));
    this.current = this.pickColor();
    this.next = this.pickColor();
  }

  private rowLen = (r: number) => (r % 2 ? COLS - 1 : COLS);
  private pos = (r: number, c: number) => ({ x: R + c * 2 * R + (r % 2 ? R : 0), y: this.top + R + r * ROW_H });

  private neighbours(r: number, c: number): Cell[] {
    const d = r % 2
      ? [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]]
      : [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]];
    return d.map(([dr, dc]) => ({ r: r + dr!, c: c + dc! })).filter((n) => n.r >= 0 && n.c >= 0 && n.c < this.rowLen(n.r));
  }

  private pickColor() {
    const present = [...new Set(this.grid.values())];
    const pool = present.length ? present : [0, 1, 2, 3, 4];
    return pool[Math.floor(this.random() * pool.length)]!;
  }

  private fire() {
    if (this.shot) return;
    const sp = 720;
    this.shot = { x: W / 2, y: H - 50, vx: Math.cos(this.angle) * sp, vy: Math.sin(this.angle) * sp, color: this.current };
    this.current = this.next;
    this.next = this.pickColor();
    this.sfx.click();
  }

  private snap(x: number, y: number, color: number) {
    // Nearest empty cell to the impact point.
    const approxR = Math.max(0, Math.round((y - this.top - R) / ROW_H));
    let best: Cell | null = null;
    let bestD = Infinity;
    for (let r = Math.max(0, approxR - 1); r <= approxR + 1; r++)
      for (let c = 0; c < this.rowLen(r); c++) {
        if (this.grid.has(`${r},${c}`)) continue;
        const p = this.pos(r, c);
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { r, c };
        }
      }
    if (!best) return;
    this.grid.set(`${best.r},${best.c}`, color);
    this.resolve(best, color);
    this.shots++;
    if (this.shots % SHOTS_PER_DESCENT === 0) this.top += ROW_H;
    if (this.grid.size === 0) {
      this.addScore(2000);
      this.sfx.win();
      this.end('won', { shots: this.shots });
      return;
    }
    for (const key of this.grid.keys()) {
      const [r, c] = key.split(',').map(Number) as [number, number];
      if (this.pos(r, c).y + R >= DANGER_Y) {
        this.sfx.bad();
        this.end('lost', { shots: this.shots });
        return;
      }
    }
    // Keep the queued colours valid after pops.
    const present = new Set(this.grid.values());
    if (!present.has(this.current)) this.current = this.pickColor();
    if (!present.has(this.next)) this.next = this.pickColor();
  }

  private resolve(start: Cell, color: number) {
    const group: Cell[] = [];
    const seen = new Set([`${start.r},${start.c}`]);
    const stack = [start];
    while (stack.length) {
      const cell = stack.pop()!;
      group.push(cell);
      for (const n of this.neighbours(cell.r, cell.c)) {
        const k = `${n.r},${n.c}`;
        if (!seen.has(k) && this.grid.get(k) === color) {
          seen.add(k);
          stack.push(n);
        }
      }
    }
    if (group.length < 3) return;
    for (const g of group) this.grid.delete(`${g.r},${g.c}`);
    this.addScore(group.length * 10);
    this.sfx.beep(500 + group.length * 30, 0.08, 'triangle');
    // Drop clusters no longer attached to the ceiling.
    const anchored = new Set<string>();
    const queue: Cell[] = [];
    for (let c = 0; c < COLS; c++) if (this.grid.has(`0,${c}`)) {
      anchored.add(`0,${c}`);
      queue.push({ r: 0, c });
    }
    while (queue.length) {
      const cell = queue.pop()!;
      for (const n of this.neighbours(cell.r, cell.c)) {
        const k = `${n.r},${n.c}`;
        if (this.grid.has(k) && !anchored.has(k)) {
          anchored.add(k);
          queue.push(n);
        }
      }
    }
    let dropped = 0;
    for (const [k, col] of [...this.grid]) {
      if (anchored.has(k)) continue;
      const [r, c] = k.split(',').map(Number) as [number, number];
      const p = this.pos(r, c);
      this.falling.push({ x: p.x, y: p.y, vy: 0, color: col });
      this.grid.delete(k);
      dropped++;
    }
    if (dropped) this.addScore(dropped * 25);
  }

  protected update(dt: number) {
    const i = this.input;
    // Aim with the pointer or ←/→.
    if (i.pointer.down || i.releases.length) {
      const p = i.releases[0] ?? i.pointer;
      this.angle = Math.atan2(Math.min(p.y, H - 60) - (H - 50), p.x - W / 2);
    }
    if (i.left) this.angle -= 1.8 * dt;
    if (i.right) this.angle += 1.8 * dt;
    this.angle = clamp(this.angle, -Math.PI + 0.15, -0.15);
    if (i.anyHit('Space', 'ArrowUp', 'Enter') || i.releases.length) this.fire();

    if (this.shot) {
      const s = this.shot;
      for (let step = 0; step < 4 && this.shot; step++) {
        s.x += (s.vx * dt) / 4;
        s.y += (s.vy * dt) / 4;
        if (s.x < R || s.x > W - R) {
          s.vx *= -1;
          s.x = clamp(s.x, R, W - R);
        }
        let hit = s.y - R <= this.top;
        if (!hit) {
          for (const k of this.grid.keys()) {
            const [r, c] = k.split(',').map(Number) as [number, number];
            const p = this.pos(r, c);
            if ((p.x - s.x) ** 2 + (p.y - s.y) ** 2 < (R * 1.7) ** 2) {
              hit = true;
              break;
            }
          }
        }
        if (hit) {
          this.shot = null;
          this.snap(s.x, s.y, s.color);
        }
      }
    }
    for (const f of this.falling) {
      f.vy += 900 * dt;
      f.y += f.vy * dt;
    }
    this.falling = this.falling.filter((f) => f.y < H + 40);
  }

  private bubble(ctx: CanvasRenderingContext2D, x: number, y: number, color: number) {
    this.circle(ctx, x, y, R - 1, COLORS[color]!);
    ctx.globalAlpha = 0.45;
    this.circle(ctx, x - R / 3, y - R / 3, R / 3, '#fff');
    ctx.globalAlpha = 1;
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#1b2350';
    ctx.fillRect(0, 0, W, this.top);
    for (const [k, color] of this.grid) {
      const [r, c] = k.split(',').map(Number) as [number, number];
      const p = this.pos(r, c);
      this.bubble(ctx, p.x, p.y, color);
    }
    for (const f of this.falling) this.bubble(ctx, f.x, f.y, f.color);
    ctx.strokeStyle = 'rgba(244,63,94,0.5)';
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(0, DANGER_Y);
    ctx.lineTo(W, DANGER_Y);
    ctx.stroke();
    // Aim guide
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(W / 2, H - 50);
    ctx.lineTo(W / 2 + Math.cos(this.angle) * 140, H - 50 + Math.sin(this.angle) * 140);
    ctx.stroke();
    ctx.setLineDash([]);
    if (this.shot) this.bubble(ctx, this.shot.x, this.shot.y, this.shot.color);
    else this.bubble(ctx, W / 2, H - 50, this.current);
    this.text(ctx, 'Next', W - 80, H - 46, { size: 12, color: '#9aa0c0', font: 'body' });
    this.bubble(ctx, W - 30, H - 50, this.next);
    this.text(ctx, `Score ${this.score}`, 10, 30, { size: 16 });
    this.text(ctx, `Ceiling drops in ${SHOTS_PER_DESCENT - (this.shots % SHOTS_PER_DESCENT)}`, W - 10, 30, { size: 12, align: 'right', color: '#9aa0c0', font: 'body' });
  }
}

export default defineGame(
  {
    key: 'bubble-shooter',
    engine: 'CANVAS',
    aspectRatio: W / H,
    orientation: 'portrait',
    maxScore: 60_000,
    controls: [
      { action: 'Aim', keys: 'Mouse / drag / ← →' },
      { action: 'Fire', keys: 'Release / Space' },
    ],
  },
  (host) => new BubbleShooter(host),
);
