import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';
import { clamp, overlaps } from '../../kit/util';

const W = 480;
const H = 600;
const COLS = 9;
const ROWS = 5;

interface Alien { col: number; row: number; alive: boolean }
interface Bolt { x: number; y: number; vy: number }

class AlienWave extends CanvasGame {
  private aliens: Alien[] = [];
  private offsetX = 0;
  private offsetY = 0;
  private dir = 1;
  private player = W / 2;
  private shot: Bolt | null = null;
  private bolts: Bolt[] = [];
  private shields: number[][] = [];
  private lives = 3;
  private wave = 1;
  private saucer: { x: number; dir: number } | null = null;
  private stepTimer = 0;
  private frame = 0;

  constructor(host: GameHost) {
    super(host, { width: W, height: H, background: '#030712' });
  }

  protected reset() {
    this.lives = 3;
    this.wave = 1;
    this.shields = Array.from({ length: 4 }, () => Array(12).fill(3));
    this.newWave();
  }

  private newWave() {
    this.aliens = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) this.aliens.push({ col: c, row: r, alive: true });
    this.offsetX = 30;
    this.offsetY = 60 + Math.min(80, (this.wave - 1) * 16);
    this.dir = 1;
    this.bolts = [];
    this.shot = null;
  }

  private alienBox(a: Alien) {
    return { x: this.offsetX + a.col * 44, y: this.offsetY + a.row * 36, w: 30, h: 22 };
  }

  private shieldBlocks() {
    return this.shields.flatMap((s, k) => s.map((hp, j) => ({ k, j, hp, box: { x: 50 + k * 115 + (j % 4) * 14, y: 470 + Math.floor(j / 4) * 12, w: 14, h: 12 } })));
  }

  protected update(dt: number) {
    const i = this.input;
    if (i.left) this.player -= 280 * dt;
    if (i.right) this.player += 280 * dt;
    if (i.pointer.down) this.player += clamp(i.pointer.x - this.player, -320 * dt, 320 * dt);
    this.player = clamp(this.player, 24, W - 24);
    if ((i.anyHit('Space', 'ArrowUp') || i.taps.length) && !this.shot) {
      this.shot = { x: this.player, y: H - 64, vy: -600 };
      this.sfx.beep(900, 0.04, 'square', 0.03);
    }
    const alive = this.aliens.filter((a) => a.alive);
    // March: fewer aliens → faster steps.
    this.stepTimer -= dt;
    if (this.stepTimer <= 0) {
      this.stepTimer = Math.max(0.06, 0.6 * (alive.length / (COLS * ROWS)) - this.wave * 0.02);
      this.frame ^= 1;
      const boxes = alive.map((a) => this.alienBox(a));
      const left = Math.min(...boxes.map((b) => b.x));
      const right = Math.max(...boxes.map((b) => b.x + b.w));
      if ((this.dir > 0 && right + 12 > W) || (this.dir < 0 && left - 12 < 0)) {
        this.dir *= -1;
        this.offsetY += 18;
      } else this.offsetX += this.dir * 12;
      this.sfx.beep(this.frame ? 80 : 70, 0.04, 'square', 0.02);
    }
    if (this.random() < dt * (0.8 + this.wave * 0.3) && alive.length) {
      const shooter = alive[Math.floor(this.random() * alive.length)]!;
      const b = this.alienBox(shooter);
      this.bolts.push({ x: b.x + b.w / 2, y: b.y + b.h, vy: 220 + this.wave * 20 });
    }
    if (!this.saucer && this.random() < dt * 0.06) this.saucer = { x: this.random() < 0.5 ? -40 : W + 40, dir: 0 };
    if (this.saucer) {
      if (!this.saucer.dir) this.saucer.dir = this.saucer.x < 0 ? 1 : -1;
      this.saucer.x += this.saucer.dir * 120 * dt;
      if (this.saucer.x < -60 || this.saucer.x > W + 60) this.saucer = null;
    }
    const blocks = this.shieldBlocks();
    const hitShield = (bolt: Bolt) => {
      const blk = blocks.find((b) => b.hp > 0 && overlaps({ x: bolt.x - 2, y: bolt.y - 6, w: 4, h: 12 }, b.box));
      if (blk) {
        this.shields[blk.k]![blk.j]!--;
        return true;
      }
      return false;
    };
    if (this.shot) {
      this.shot.y += this.shot.vy * dt;
      const s = { x: this.shot.x - 2, y: this.shot.y, w: 4, h: 12 };
      const hit = alive.find((a) => overlaps(s, this.alienBox(a)));
      if (hit) {
        hit.alive = false;
        this.addScore((ROWS - hit.row) * 10);
        this.shot = null;
        this.sfx.beep(200, 0.08, 'sawtooth', 0.04);
      } else if (this.saucer && overlaps(s, { x: this.saucer.x - 24, y: 30, w: 48, h: 18 })) {
        this.addScore(150 + Math.floor(this.random() * 4) * 50);
        this.saucer = null;
        this.shot = null;
        this.sfx.good();
      } else if (hitShield(this.shot) || this.shot.y < 0) this.shot = null;
    }
    const me = { x: this.player - 20, y: H - 60, w: 40, h: 18 };
    for (const b of this.bolts) {
      b.y += b.vy * dt;
      if (hitShield(b)) b.y = H + 100;
      else if (overlaps({ x: b.x - 2, y: b.y, w: 4, h: 12 }, me)) {
        b.y = H + 100;
        this.lives--;
        this.sfx.bad();
        if (this.lives <= 0) {
          this.end('lost', { wave: this.wave });
          return;
        }
      }
    }
    this.bolts = this.bolts.filter((b) => b.y < H);
    if (alive.some((a) => this.alienBox(a).y + 22 >= H - 70)) {
      this.end('lost', { wave: this.wave });
      return;
    }
    if (!this.aliens.some((a) => a.alive)) {
      this.addScore(500 * this.wave);
      this.wave++;
      this.newWave();
    }
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    const colors = ['#f472b6', '#a78bfa', '#a78bfa', '#22d3ee', '#22d3ee'];
    for (const a of this.aliens) {
      if (!a.alive) continue;
      const b = this.alienBox(a);
      ctx.fillStyle = colors[a.row]!;
      ctx.fillRect(b.x + 4, b.y, b.w - 8, b.h - 6);
      ctx.fillRect(b.x, b.y + 6, b.w, 8);
      const leg = this.frame ? 0 : 4;
      ctx.fillRect(b.x + leg, b.y + b.h - 6, 6, 6);
      ctx.fillRect(b.x + b.w - 6 - leg, b.y + b.h - 6, 6, 6);
      ctx.fillStyle = '#030712';
      ctx.fillRect(b.x + 8, b.y + 6, 4, 4);
      ctx.fillRect(b.x + b.w - 12, b.y + 6, 4, 4);
    }
    for (const blk of this.shieldBlocks()) if (blk.hp > 0) {
      ctx.fillStyle = ['', '#166534', '#16a34a', '#4ade80'][blk.hp]!;
      ctx.fillRect(blk.box.x, blk.box.y, blk.box.w, blk.box.h);
    }
    if (this.saucer) this.roundRect(ctx, this.saucer.x - 24, 30, 48, 16, 8, '#ef4444');
    for (const b of this.bolts) {
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(b.x - 2, b.y, 4, 12);
    }
    if (this.shot) {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(this.shot.x - 2, this.shot.y, 4, 12);
    }
    this.glow(ctx, '#22d3ee', 10);
    this.roundRect(ctx, this.player - 20, H - 60, 40, 14, 4, '#22d3ee');
    this.roundRect(ctx, this.player - 5, H - 70, 10, 12, 3, '#22d3ee');
    this.noGlow(ctx);
    this.hud(ctx, `Score ${this.score}  ·  Wave ${this.wave}`, '▲'.repeat(Math.max(0, this.lives)));
  }
}

export default defineGame(
  { key: 'alien-wave', engine: 'CANVAS', aspectRatio: W / H, orientation: 'portrait', maxScore: 2_000_000, controls: [{ action: 'Move', keys: '← → / drag' }, { action: 'Fire', keys: 'Space / tap' }] },
  (host) => new AlienWave(host),
);
