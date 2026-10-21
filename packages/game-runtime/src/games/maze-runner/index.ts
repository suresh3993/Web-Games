import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';
import { generateMaze, open } from '../../kit/maze';

const W = 600;
const H = 640;
const AREA = 560;

class MazeRunner extends CanvasGame {
  private level = 0;
  private walls: number[][] = [];
  private n = 8;
  private player = { r: 0, c: 0 };
  private exit = { r: 0, c: 0 };
  private keys: { r: number; c: number }[] = [];
  private timeLeft = 0;
  private moveCd = 0;
  private trail = new Set<string>();

  constructor(host: GameHost) {
    super(host, { width: W, height: H, background: '#070b1d' });
  }

  protected reset() {
    this.level = 0;
    this.nextLevel();
  }

  private nextLevel() {
    this.level++;
    this.n = Math.min(24, 6 + this.level * 2);
    this.walls = generateMaze(this.n, this.n, this.random);
    this.player = { r: 0, c: 0 };
    this.exit = { r: this.n - 1, c: this.n - 1 };
    // Bonus keys add time when collected.
    this.keys = Array.from({ length: Math.min(4, this.level) }, () => ({ r: 1 + Math.floor(this.random() * (this.n - 2)), c: 1 + Math.floor(this.random() * (this.n - 2)) }));
    this.timeLeft = 15 + this.n * 2.2;
    this.trail = new Set(['0,0']);
  }

  private step(dir: 'N' | 'E' | 'S' | 'W') {
    const { r, c } = this.player;
    if (!open(this.walls, r, c, dir)) return;
    this.player = { r: r + (dir === 'S' ? 1 : dir === 'N' ? -1 : 0), c: c + (dir === 'E' ? 1 : dir === 'W' ? -1 : 0) };
    this.trail.add(`${this.player.r},${this.player.c}`);
    const k = this.keys.findIndex((key) => key.r === this.player.r && key.c === this.player.c);
    if (k >= 0) {
      this.keys.splice(k, 1);
      this.timeLeft += 6;
      this.addScore(25);
      this.sfx.good();
    }
    if (this.player.r === this.exit.r && this.player.c === this.exit.c) {
      this.addScore(100 * this.level + Math.floor(this.timeLeft) * 5);
      this.sfx.win();
      this.nextLevel();
    }
  }

  protected update(dt: number) {
    const i = this.input;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.sfx.bad();
      this.end('completed', { level: this.level });
      return;
    }
    const swipeMap = { up: 'N', right: 'E', down: 'S', left: 'W' } as const;
    if (i.swipe) return this.step(swipeMap[i.swipe]);
    // Tap: move one step toward the tapped point.
    if (i.taps.length) {
      const size = AREA / this.n;
      const t = i.taps[0]!;
      const px = 20 + (this.player.c + 0.5) * size;
      const py = 60 + (this.player.r + 0.5) * size;
      const dx = t.x - px;
      const dy = t.y - py;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > size / 2) this.step(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N');
      return;
    }
    this.moveCd -= dt;
    const dir = i.up ? 'N' : i.down ? 'S' : i.left ? 'W' : i.right ? 'E' : null;
    const fresh = i.anyHit('ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD');
    if (dir && (fresh || this.moveCd <= 0)) {
      this.step(dir);
      this.moveCd = fresh ? 0.2 : 0.09;
    }
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    const size = AREA / this.n;
    const ox = 20;
    const oy = 60;
    ctx.fillStyle = 'rgba(124,92,255,0.12)';
    for (const t of this.trail) {
      const [r, c] = t.split(',').map(Number) as [number, number];
      ctx.fillRect(ox + c * size, oy + r * size, size, size);
    }
    this.glow(ctx, '#4ade80', 14);
    this.roundRect(ctx, ox + this.exit.c * size + 3, oy + this.exit.r * size + 3, size - 6, size - 6, 4, '#4ade80');
    this.noGlow(ctx);
    for (const k of this.keys) this.text(ctx, '⚿', ox + (k.c + 0.5) * size, oy + (k.r + 0.5) * size + size * 0.25, { size: size * 0.7, align: 'center', color: '#facc15' });
    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = Math.max(2, size / 10);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let r = 0; r < this.n; r++)
      for (let c = 0; c < this.n; c++) {
        const w = this.walls[r]![c]!;
        const x = ox + c * size;
        const y = oy + r * size;
        if (w & 1) { ctx.moveTo(x, y); ctx.lineTo(x + size, y); }
        if (w & 2) { ctx.moveTo(x + size, y); ctx.lineTo(x + size, y + size); }
        if (w & 4) { ctx.moveTo(x, y + size); ctx.lineTo(x + size, y + size); }
        if (w & 8) { ctx.moveTo(x, y); ctx.lineTo(x, y + size); }
      }
    ctx.stroke();
    this.glow(ctx, '#22d3ee', 12);
    this.circle(ctx, ox + (this.player.c + 0.5) * size, oy + (this.player.r + 0.5) * size, size * 0.32, '#22d3ee');
    this.noGlow(ctx);
    this.hud(ctx, `Maze ${this.level}  ·  Score ${this.score}`, `⏱ ${Math.max(0, Math.ceil(this.timeLeft))}s`);
    if (this.timeLeft < 8) this.text(ctx, 'Hurry!', W / 2, 30, { size: 16, align: 'center', color: '#fb7185' });
  }
}

export default defineGame(
  {
    key: 'maze-runner',
    engine: 'CANVAS',
    aspectRatio: W / H,
    maxScore: 200_000,
    controls: [
      { action: 'Move', keys: 'Arrows / WASD / swipe / tap' },
      { action: 'Goal', keys: 'Reach the green exit; keys add time' },
    ],
  },
  (host) => new MazeRunner(host),
);
