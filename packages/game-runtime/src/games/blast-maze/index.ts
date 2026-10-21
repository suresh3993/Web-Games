import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';

const N = 13;
const CELL = 40;
const W = N * CELL;
const H = N * CELL + 32;
const FUSE = 2.2;

type Tile = 'wall' | 'block' | 'floor';
interface Bomber { x: number; y: number; alive: boolean; bombs: number; range: number; cooldown: number; color: string; cpu: boolean; target: { x: number; y: number } | null }
interface Bomb { x: number; y: number; t: number; range: number; owner: number }
interface Flame { x: number; y: number; t: number }

class BlastMaze extends CanvasGame {
  private grid: Tile[][] = [];
  private powerups = new Map<string, 'bomb' | 'range'>();
  private bombers: Bomber[] = [];
  private bombs: Bomb[] = [];
  private flames: Flame[] = [];
  private moveCd = 0;

  constructor(host: GameHost) {
    super(host, { width: W, height: H, background: '#14532d' });
  }

  protected reset() {
    this.grid = Array.from({ length: N }, (_, r) =>
      Array.from({ length: N }, (_, c): Tile => {
        if (r === 0 || c === 0 || r === N - 1 || c === N - 1 || (r % 2 === 0 && c % 2 === 0)) return 'wall';
        const corner = (r < 3 || r > N - 4) && (c < 3 || c > N - 4);
        return !corner && this.random() < 0.7 ? 'block' : 'floor';
      }),
    );
    this.powerups.clear();
    const spawn = (x: number, y: number, color: string, cpu: boolean): Bomber => ({ x, y, alive: true, bombs: 1, range: 2, cooldown: 0, color, cpu, target: null });
    this.bombers = [spawn(1, 1, '#f8fafc', false), spawn(N - 2, 1, '#f43f5e', true), spawn(1, N - 2, '#3b82f6', true), spawn(N - 2, N - 2, '#facc15', true)];
    this.bombs = [];
    this.flames = [];
  }

  private walkable(x: number, y: number) {
    return this.grid[y]?.[x] === 'floor' && !this.bombs.some((b) => b.x === x && b.y === y);
  }

  /** Cells a bomb at (x,y) with range would hit. */
  private blastCells(x: number, y: number, range: number) {
    const cells = [{ x, y }];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
      for (let k = 1; k <= range; k++) {
        const t = this.grid[y + dy * k]?.[x + dx * k];
        if (!t || t === 'wall') break;
        cells.push({ x: x + dx * k, y: y + dy * k });
        if (t === 'block') break;
      }
    return cells;
  }

  private danger(x: number, y: number) {
    return this.bombs.some((b) => this.blastCells(b.x, b.y, b.range).some((c) => c.x === x && c.y === y)) || this.flames.some((f) => f.x === x && f.y === y);
  }

  private placeBomb(i: number) {
    const b = this.bombers[i]!;
    const active = this.bombs.filter((x) => x.owner === i).length;
    if (!b.alive || active >= b.bombs || this.bombs.some((x) => x.x === b.x && x.y === b.y)) return;
    this.bombs.push({ x: b.x, y: b.y, t: FUSE, range: b.range, owner: i });
  }

  private explode(bomb: Bomb) {
    this.sfx.beep(90, 0.25, 'sawtooth', 0.05);
    for (const c of this.blastCells(bomb.x, bomb.y, bomb.range)) {
      this.flames.push({ ...c, t: 0.45 });
      if (this.grid[c.y]![c.x] === 'block') {
        this.grid[c.y]![c.x] = 'floor';
        if (bomb.owner === 0) this.addScore(10);
        if (this.random() < 0.25) this.powerups.set(`${c.x},${c.y}`, this.random() < 0.5 ? 'bomb' : 'range');
      }
      // Chain reactions
      for (const other of this.bombs) if (other !== bomb && other.x === c.x && other.y === c.y && other.t > 0.05) other.t = 0.05;
    }
  }

  private moveBomber(i: number, dx: number, dy: number) {
    const b = this.bombers[i]!;
    if (this.walkable(b.x + dx, b.y + dy)) {
      b.x += dx;
      b.y += dy;
      const key = `${b.x},${b.y}`;
      const pu = this.powerups.get(key);
      if (pu) {
        this.powerups.delete(key);
        if (pu === 'bomb') b.bombs++;
        else b.range++;
        if (i === 0) this.sfx.good();
      }
    }
  }

  /** CPU: flee danger, otherwise bomb next to blocks/rivals and wander. */
  private cpuThink(i: number) {
    const b = this.bombers[i]!;
    const moves = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
    if (this.danger(b.x, b.y)) {
      // BFS to the nearest safe tile.
      const seen = new Set([`${b.x},${b.y}`]);
      const queue: { x: number; y: number; first: readonly [number, number] | null }[] = [{ x: b.x, y: b.y, first: null }];
      while (queue.length) {
        const cur = queue.shift()!;
        if (!this.danger(cur.x, cur.y)) {
          if (cur.first) this.moveBomber(i, cur.first[0], cur.first[1]);
          return;
        }
        for (const m of moves) {
          const nx = cur.x + m[0];
          const ny = cur.y + m[1];
          const k = `${nx},${ny}`;
          if (seen.has(k) || !this.walkable(nx, ny)) continue;
          seen.add(k);
          queue.push({ x: nx, y: ny, first: cur.first ?? m });
        }
      }
      return;
    }
    const nearBlock = moves.some(([dx, dy]) => this.grid[b.y + dy]?.[b.x + dx] === 'block');
    const nearRival = this.bombers.some((o, j) => j !== i && o.alive && Math.abs(o.x - b.x) + Math.abs(o.y - b.y) <= 2);
    if ((nearBlock || nearRival) && this.random() < 0.5) {
      // Only bomb if an escape exists.
      const escape = moves.some(([dx, dy]) => this.walkable(b.x + dx, b.y + dy));
      if (escape) this.placeBomb(i);
      return;
    }
    const options = moves.filter(([dx, dy]) => this.walkable(b.x + dx, b.y + dy) && !this.danger(b.x + dx, b.y + dy));
    if (options.length) {
      const [dx, dy] = options[Math.floor(this.random() * options.length)]!;
      this.moveBomber(i, dx, dy);
    }
  }

  protected update(dt: number) {
    const i = this.input;
    this.moveCd -= dt;
    const me = this.bombers[0]!;
    if (me.alive && this.moveCd <= 0) {
      const dir = i.up || i.swipe === 'up' ? [0, -1] : i.down || i.swipe === 'down' ? [0, 1] : i.left || i.swipe === 'left' ? [-1, 0] : i.right || i.swipe === 'right' ? [1, 0] : null;
      if (dir) {
        this.moveBomber(0, dir[0]!, dir[1]!);
        this.moveCd = 0.16;
      }
    }
    if (i.anyHit('Space', 'Enter') || (i.taps.length && !i.swipe)) this.placeBomb(0);
    for (let k = 1; k < this.bombers.length; k++) {
      const b = this.bombers[k]!;
      if (!b.alive) continue;
      b.cooldown -= dt;
      if (b.cooldown <= 0) {
        b.cooldown = 0.32;
        this.cpuThink(k);
      }
    }
    for (const bomb of this.bombs) bomb.t -= dt;
    const exploding = this.bombs.filter((b) => b.t <= 0);
    this.bombs = this.bombs.filter((b) => b.t > 0);
    for (const b of exploding) this.explode(b);
    for (const f of this.flames) f.t -= dt;
    this.flames = this.flames.filter((f) => f.t > 0);
    for (const [k, b] of this.bombers.entries()) {
      if (b.alive && this.flames.some((f) => f.x === b.x && f.y === b.y)) {
        b.alive = false;
        if (k > 0) this.addScore(300);
        this.sfx[k === 0 ? 'bad' : 'good']();
      }
    }
    if (!me.alive) {
      this.end('lost', { rivalsLeft: this.bombers.filter((b) => b.cpu && b.alive).length });
      return;
    }
    if (this.bombers.every((b) => !b.cpu || !b.alive)) {
      this.addScore(1000 + Math.max(0, 180 - Math.floor(this.time)) * 5);
      this.sfx.win();
      this.end('won');
    }
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) {
        const t = this.grid[r]![c]!;
        if (t === 'wall') this.roundRect(ctx, c * CELL + 1, r * CELL + 1, CELL - 2, CELL - 2, 4, '#334155');
        if (t === 'block') this.roundRect(ctx, c * CELL + 3, r * CELL + 3, CELL - 6, CELL - 6, 4, '#a16207');
      }
    for (const [k, pu] of this.powerups) {
      const [c, r] = k.split(',').map(Number) as [number, number];
      this.text(ctx, pu === 'bomb' ? '+●' : '+⇔', c * CELL + CELL / 2, r * CELL + CELL / 2 + 6, { size: 14, align: 'center', color: '#fde047' });
    }
    for (const b of this.bombs) {
      const pulse = this.reducedMotion ? 1 : 1 + Math.sin(this.time * 16) * 0.08;
      this.circle(ctx, b.x * CELL + CELL / 2, b.y * CELL + CELL / 2, 13 * pulse, '#0f172a');
      this.circle(ctx, b.x * CELL + CELL / 2 + 6, b.y * CELL + CELL / 2 - 10, 3, b.t < 0.6 ? '#ef4444' : '#f97316');
    }
    for (const f of this.flames) {
      ctx.globalAlpha = Math.min(1, f.t * 3);
      this.roundRect(ctx, f.x * CELL + 4, f.y * CELL + 4, CELL - 8, CELL - 8, 8, '#f97316');
    }
    ctx.globalAlpha = 1;
    for (const b of this.bombers) {
      if (!b.alive) continue;
      this.circle(ctx, b.x * CELL + CELL / 2, b.y * CELL + CELL / 2, 14, b.color);
      this.circle(ctx, b.x * CELL + CELL / 2, b.y * CELL + CELL / 2 - 2, 5, '#0f172a');
    }
    const rivals = this.bombers.filter((b) => b.cpu && b.alive).length;
    this.text(ctx, `Rivals left ${rivals}  ·  Bombs ${this.bombers[0]!.bombs}  ·  Range ${this.bombers[0]!.range}  ·  Score ${this.score}`, 10, H - 10, { size: 14, font: 'body' });
  }
}

export default defineGame(
  { key: 'blast-maze', engine: 'CANVAS', aspectRatio: W / H, maxScore: 4_000, controls: [{ action: 'Move', keys: 'Arrows / WASD / swipe' }, { action: 'Drop bomb', keys: 'Space / tap' }] },
  (host) => new BlastMaze(host),
);
