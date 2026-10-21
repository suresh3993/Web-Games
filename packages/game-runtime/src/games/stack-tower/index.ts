import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';

const W = 400;
const H = 640;
const BLOCK_H = 26;

interface Block { x: number; w: number; hue: number }

class StackTower extends CanvasGame {
  private stack: Block[] = [];
  private moving: Block = { x: 0, w: 200, hue: 0 };
  private dir = 1;
  private perfect = 0;
  private falling: { x: number; y: number; w: number; vy: number; hue: number }[] = [];

  constructor(host: GameHost) {
    super(host, { width: W, height: H, background: '#0f0a1e' });
  }

  protected reset() {
    this.stack = [{ x: 100, w: 200, hue: 250 }];
    this.perfect = 0;
    this.falling = [];
    this.spawn();
  }

  private spawn() {
    const top = this.stack.at(-1)!;
    this.dir = this.stack.length % 2 ? 1 : -1;
    this.moving = { x: this.dir > 0 ? -top.w : W, w: top.w, hue: (top.hue + 12) % 360 };
  }

  private drop() {
    const top = this.stack.at(-1)!;
    const left = Math.max(top.x, this.moving.x);
    const right = Math.min(top.x + top.w, this.moving.x + this.moving.w);
    const overlap = right - left;
    if (overlap <= 0) {
      this.falling.push({ x: this.moving.x, y: this.screenYOf(this.stack.length), w: this.moving.w, vy: 0, hue: this.moving.hue });
      this.sfx.bad();
      this.end('completed', { height: this.stack.length - 1 });
      return;
    }
    let block: Block;
    if (Math.abs(this.moving.x - top.x) < 4) {
      // Perfect drop: no trim, small grow-back reward.
      this.perfect++;
      block = { x: top.x, w: Math.min(220, top.w + (this.perfect >= 3 ? 8 : 0)), hue: this.moving.hue };
      this.addScore(20);
      this.sfx.beep(600 + this.perfect * 60, 0.08, 'triangle');
    } else {
      this.perfect = 0;
      block = { x: left, w: overlap, hue: this.moving.hue };
      const cutX = this.moving.x < top.x ? this.moving.x : right;
      this.falling.push({ x: cutX, y: this.screenYOf(this.stack.length), w: this.moving.w - overlap, vy: 0, hue: this.moving.hue });
      this.sfx.click();
    }
    this.stack.push(block);
    this.addScore(10);
    this.spawn();
  }

  private screenYOf(index: number) {
    const camera = Math.max(0, this.stack.length - 14) * BLOCK_H;
    return H - 80 - index * BLOCK_H + camera;
  }

  protected update(dt: number) {
    if (this.input.action()) return this.drop();
    const speed = 160 + this.stack.length * 6;
    this.moving.x += this.dir * speed * dt;
    if (this.moving.x > W) this.dir = -1;
    if (this.moving.x + this.moving.w < 0) this.dir = 1;
    for (const f of this.falling) {
      f.vy += 900 * dt;
      f.y += f.vy * dt;
    }
    this.falling = this.falling.filter((f) => f.y < H + 50);
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    this.stack.forEach((b, k) => this.roundRect(ctx, b.x, this.screenYOf(k), b.w, BLOCK_H - 2, 3, `hsl(${b.hue} 80% 60%)`));
    if (!this.finished) this.roundRect(ctx, this.moving.x, this.screenYOf(this.stack.length), this.moving.w, BLOCK_H - 2, 3, `hsl(${this.moving.hue} 80% 65%)`);
    for (const f of this.falling) this.roundRect(ctx, f.x, f.y, f.w, BLOCK_H - 2, 3, `hsl(${f.hue} 60% 45%)`);
    this.text(ctx, String(this.stack.length - 1), W / 2, 80, { size: 54, align: 'center' });
    if (this.perfect >= 2) this.text(ctx, `Perfect ×${this.perfect}`, W / 2, 114, { size: 16, align: 'center', color: '#fde047' });
    if (this.stack.length < 3) this.text(ctx, 'Tap / Space to drop the block', W / 2, H - 30, { size: 14, align: 'center', color: '#c4b5fd', font: 'body' });
  }
}

export default defineGame(
  { key: 'stack-tower', engine: 'CANVAS', aspectRatio: W / H, orientation: 'portrait', maxScore: 200_000, controls: [{ action: 'Drop block', keys: 'Space / click / tap' }] },
  (host) => new StackTower(host),
);
