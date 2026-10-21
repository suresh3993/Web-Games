import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';

/** Original maze layout. '#' wall, '.' pellet, 'o' power orb, ' ' empty, 'G' ghost house, 'M' start. */
const MAZE = [
  '###################',
  '#o.......#.......o#',
  '#.##.###.#.###.##.#',
  '#.................#',
  '#.##.#.#####.#.##.#',
  '#....#...#...#....#',
  '####.### # ###.####',
  '   #.#   G   #.#   ',
  '####.# ##G## #.####',
  '    .  #GGG#  .    ',
  '####.# ##### #.####',
  '   #.#       #.#   ',
  '####.# ##### #.####',
  '#........#........#',
  '#.##.###.#.###.##.#',
  '#o.#.....M.....#.o#',
  '##.#.#.#####.#.#.##',
  '#....#...#...#....#',
  '#.######.#.######.#',
  '#.................#',
  '###################',
];
const COLS = MAZE[0]!.length;
const ROWS = MAZE.length;
const CELL = 26;
const W = COLS * CELL;
const H = ROWS * CELL + 30;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const satisfies Record<string, readonly [number, number]>;
type Dir = keyof typeof DIRS;

interface Mover { x: number; y: number; dir: Dir; speed: number }
interface Ghost extends Mover { color: string; personality: 'chase' | 'ambush' | 'random' | 'shy'; home: { x: number; y: number }; eaten: boolean }

class MazeMuncher extends CanvasGame {
  private walls: boolean[][] = [];
  private pellets = new Map<string, 'pellet' | 'power'>();
  private player!: Mover;
  private wanted: Dir = 'left';
  private ghosts: Ghost[] = [];
  private frightened = 0;
  private lives = 3;
  private level = 1;
  private combo = 0;

  constructor(host: GameHost) {
    super(host, { width: W, height: H, background: '#020617' });
  }

  protected reset() {
    this.lives = 3;
    this.level = 1;
    this.loadLevel();
  }

  private loadLevel() {
    this.walls = MAZE.map((row) => [...row].map((ch) => ch === '#'));
    this.pellets.clear();
    MAZE.forEach((row, r) => [...row].forEach((ch, c) => {
      if (ch === '.') this.pellets.set(`${c},${r}`, 'pellet');
      if (ch === 'o') this.pellets.set(`${c},${r}`, 'power');
    }));
    this.resetPositions();
  }

  private resetPositions() {
    const start = this.find('M');
    this.player = { x: start.c, y: start.r, dir: 'left', speed: 6.5 };
    this.wanted = 'left';
    const house = [this.find('G'), { c: 8, r: 9 }, { c: 9, r: 9 }, { c: 10, r: 9 }];
    const colors = ['#ef4444', '#f472b6', '#22d3ee', '#fb923c'];
    const personalities: Ghost['personality'][] = ['chase', 'ambush', 'random', 'shy'];
    this.ghosts = house.map((h, k) => ({ x: h.c, y: h.r, dir: 'up', speed: 4.6 + this.level * 0.3, color: colors[k]!, personality: personalities[k]!, home: { x: h.c, y: h.r }, eaten: false }));
    this.frightened = 0;
  }

  private find(ch: string) {
    for (let r = 0; r < ROWS; r++) {
      const c = MAZE[r]!.indexOf(ch);
      if (c >= 0) return { c, r };
    }
    return { c: 1, r: 1 };
  }

  private open(c: number, r: number, ghost = false) {
    const cc = (c + COLS) % COLS;
    if (r < 0 || r >= ROWS) return false;
    if (!ghost && MAZE[r]![cc] === 'G') return false;
    return !this.walls[r]![cc];
  }

  /** Moves along the grid; turns only at cell centres. */
  private advance(m: Mover, choose: () => Dir, dt: number, ghost = false) {
    let remaining = m.speed * dt;
    while (remaining > 0) {
      const cx = Math.round(m.x);
      const cy = Math.round(m.y);
      const atCentre = Math.abs(m.x - cx) < 1e-6 && Math.abs(m.y - cy) < 1e-6;
      if (atCentre) {
        const want = choose();
        const [wx, wy] = DIRS[want]!;
        if (this.open(cx + wx, cy + wy, ghost)) m.dir = want;
        const [dx, dy] = DIRS[m.dir]!;
        if (!this.open(cx + dx, cy + dy, ghost)) return;
      }
      const [dx, dy] = DIRS[m.dir]!;
      // Distance to the next cell centre in the current direction.
      const toNext = dx ? (dx > 0 ? Math.floor(m.x) + 1 - m.x : m.x - Math.ceil(m.x) + 1) : dy > 0 ? Math.floor(m.y) + 1 - m.y : m.y - Math.ceil(m.y) + 1;
      const stepLen = Math.min(remaining, toNext > 1e-6 ? toNext : 1);
      m.x += dx * stepLen;
      m.y += dy * stepLen;
      remaining -= stepLen;
      if (Math.abs(m.x - Math.round(m.x)) < 1e-6) m.x = Math.round(m.x);
      if (Math.abs(m.y - Math.round(m.y)) < 1e-6) m.y = Math.round(m.y);
      if (m.x < -0.5) m.x += COLS;
      if (m.x > COLS - 0.5) m.x -= COLS;
    }
  }

  private ghostChoice(g: Ghost): Dir {
    const cx = Math.round(g.x);
    const cy = Math.round(g.y);
    const reverse: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };
    const options = (Object.keys(DIRS) as Dir[]).filter((d) => d !== reverse[g.dir] && this.open(cx + DIRS[d]![0], cy + DIRS[d]![1], true));
    if (!options.length) return reverse[g.dir];
    let target = { x: this.player.x, y: this.player.y };
    if (g.eaten) target = g.home;
    else if (this.frightened > 0 || g.personality === 'random') return options[Math.floor(this.random() * options.length)]!;
    else if (g.personality === 'ambush') {
      const [dx, dy] = DIRS[this.player.dir]!;
      target = { x: this.player.x + dx * 4, y: this.player.y + dy * 4 };
    } else if (g.personality === 'shy' && Math.hypot(g.x - this.player.x, g.y - this.player.y) < 6) target = { x: 0, y: ROWS };
    return options.sort((a, b) => {
      const da = Math.hypot(cx + DIRS[a]![0] - target.x, cy + DIRS[a]![1] - target.y);
      const db = Math.hypot(cx + DIRS[b]![0] - target.x, cy + DIRS[b]![1] - target.y);
      return da - db;
    })[0]!;
  }

  protected update(dt: number) {
    const i = this.input;
    if (i.anyHit('ArrowUp', 'KeyW') || i.swipe === 'up') this.wanted = 'up';
    if (i.anyHit('ArrowDown', 'KeyS') || i.swipe === 'down') this.wanted = 'down';
    if (i.anyHit('ArrowLeft', 'KeyA') || i.swipe === 'left') this.wanted = 'left';
    if (i.anyHit('ArrowRight', 'KeyD') || i.swipe === 'right') this.wanted = 'right';
    this.advance(this.player, () => this.wanted, dt);
    const key = `${Math.round(this.player.x)},${Math.round(this.player.y)}`;
    const pellet = this.pellets.get(key);
    if (pellet) {
      this.pellets.delete(key);
      this.addScore(pellet === 'power' ? 50 : 10);
      if (pellet === 'power') {
        this.frightened = Math.max(3, 8 - this.level);
        this.combo = 0;
        this.sfx.beep(220, 0.2, 'triangle');
      } else if (this.pellets.size % 2 === 0) this.sfx.beep(520, 0.02, 'square', 0.02);
      if (!this.pellets.size) {
        this.addScore(1000 * this.level);
        this.sfx.win();
        this.level++;
        this.loadLevel();
        return;
      }
    }
    this.frightened = Math.max(0, this.frightened - dt);
    for (const g of this.ghosts) {
      const slow = this.frightened > 0 && !g.eaten ? 0.55 : g.eaten ? 2 : 1;
      const speedBefore = g.speed;
      g.speed = speedBefore * slow;
      this.advance(g, () => this.ghostChoice(g), dt, true);
      g.speed = speedBefore;
      if (g.eaten && Math.hypot(g.x - g.home.x, g.y - g.home.y) < 0.6) g.eaten = false;
      if (!g.eaten && Math.hypot(g.x - this.player.x, g.y - this.player.y) < 0.7) {
        if (this.frightened > 0) {
          g.eaten = true;
          this.combo++;
          this.addScore(200 * 2 ** (this.combo - 1));
          this.sfx.good();
        } else {
          this.lives--;
          this.sfx.bad();
          if (this.lives <= 0) {
            this.end('lost', { level: this.level });
            return;
          }
          this.resetPositions();
          return;
        }
      }
    }
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        if (this.walls[r]![c]) this.roundRect(ctx, c * CELL + 2, r * CELL + 2, CELL - 4, CELL - 4, 5, '#1d4ed8');
      }
    for (const [k, type] of this.pellets) {
      const [c, r] = k.split(',').map(Number) as [number, number];
      this.circle(ctx, c * CELL + CELL / 2, r * CELL + CELL / 2, type === 'power' ? 7 : 2.5, '#fde68a');
    }
    for (const g of this.ghosts) {
      const x = g.x * CELL + CELL / 2;
      const y = g.y * CELL + CELL / 2;
      const color = g.eaten ? 'transparent' : this.frightened > 0 ? (this.frightened < 2 && Math.floor(this.time * 6) % 2 ? '#f8fafc' : '#3b82f6') : g.color;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y - 1, 11, Math.PI, 0);
      ctx.lineTo(x + 11, y + 10);
      ctx.lineTo(x - 11, y + 10);
      ctx.fill();
      this.circle(ctx, x - 4, y - 2, 3, '#fff');
      this.circle(ctx, x + 4, y - 2, 3, '#fff');
    }
    const px = this.player.x * CELL + CELL / 2;
    const py = this.player.y * CELL + CELL / 2;
    const mouth = this.reducedMotion ? 0.25 : 0.25 + Math.abs(Math.sin(this.time * 12)) * 0.25;
    const facing = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[this.player.dir];
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.arc(px, py, 11, facing + mouth, facing + Math.PI * 2 - mouth);
    ctx.fill();
    this.text(ctx, `Score ${this.score}  ·  Level ${this.level}  ·  ${'●'.repeat(Math.max(0, this.lives))}`, 10, H - 9, { size: 15 });
  }
}

export default defineGame(
  { key: 'maze-muncher', engine: 'CANVAS', aspectRatio: W / H, orientation: 'portrait', maxScore: 5_000_000, controls: [{ action: 'Steer', keys: 'Arrows / WASD / swipe' }] },
  (host) => new MazeMuncher(host),
);
