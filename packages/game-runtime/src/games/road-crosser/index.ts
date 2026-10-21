import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';

const COLS = 13;
const ROWS = 13;
const CELL = 40;
const W = COLS * CELL;
const H = ROWS * CELL + 40;
const HOMES = [1, 4, 6, 8, 11];

interface Lane { row: number; kind: 'road' | 'river'; speed: number; items: { x: number; len: number }[] }

class RoadCrosser extends CanvasGame {
  private px = 6;
  private py = 12;
  private rideX = 0;
  private lanes: Lane[] = [];
  private homes: boolean[] = [];
  private lives = 3;
  private level = 1;
  private timer = 30;
  private bestRow = 12;

  constructor(host: GameHost) {
    super(host, { width: W, height: H, background: '#0f172a' });
  }

  protected reset() {
    this.lives = 3;
    this.level = 1;
    this.homes = HOMES.map(() => false);
    this.buildLanes();
    this.respawn();
  }

  private buildLanes() {
    const mult = 1 + (this.level - 1) * 0.2;
    this.lanes = [];
    for (let row = 1; row <= 5; row++) {
      const speed = (row % 2 ? 1 : -1) * (40 + row * 12) * mult;
      const len = row % 3 === 0 ? 2 : 3;
      this.lanes.push({ row, kind: 'river', speed, items: Array.from({ length: 3 }, (_, k) => ({ x: k * (W / 3) + this.random() * 40, len })) });
    }
    for (let row = 7; row <= 11; row++) {
      const speed = (row % 2 ? -1 : 1) * (60 + (row - 6) * 18) * mult;
      const len = row === 9 ? 2 : 1;
      this.lanes.push({ row, kind: 'road', speed, items: Array.from({ length: 3 }, (_, k) => ({ x: k * (W / 3) + this.random() * 60, len })) });
    }
  }

  private respawn() {
    this.px = 6;
    this.py = 12;
    this.rideX = 0;
    this.timer = 30;
    this.bestRow = 12;
  }

  private lose() {
    this.lives--;
    this.sfx.bad();
    if (this.lives <= 0) {
      this.end('lost', { level: this.level });
      return;
    }
    this.respawn();
  }

  protected update(dt: number) {
    const i = this.input;
    let dx = 0;
    let dy = 0;
    if (i.anyHit('ArrowUp', 'KeyW') || i.swipe === 'up') dy = -1;
    else if (i.anyHit('ArrowDown', 'KeyS') || i.swipe === 'down') dy = 1;
    else if (i.anyHit('ArrowLeft', 'KeyA') || i.swipe === 'left') dx = -1;
    else if (i.anyHit('ArrowRight', 'KeyD') || i.swipe === 'right') dx = 1;
    else if (i.taps.length && !i.swipe) dy = -1;
    if (dx || dy) {
      this.px = Math.max(0, Math.min(COLS - 1, Math.round(this.px + this.rideX / CELL) + dx));
      this.rideX = 0;
      this.py = Math.max(0, Math.min(12, this.py + dy));
      this.sfx.click();
      if (this.py < this.bestRow) {
        this.bestRow = this.py;
        this.addScore(10);
      }
    }
    for (const lane of this.lanes)
      for (const it of lane.items) {
        it.x += lane.speed * dt;
        if (lane.speed > 0 && it.x > W) it.x -= W + it.len * CELL;
        if (lane.speed < 0 && it.x + it.len * CELL < 0) it.x += W + it.len * CELL;
      }
    this.timer -= dt;
    if (this.timer <= 0) return this.lose();
    const x = this.px * CELL + this.rideX + CELL / 2;
    const lane = this.lanes.find((l) => l.row === this.py);
    if (lane?.kind === 'road') {
      if (lane.items.some((it) => x > it.x + 4 && x < it.x + it.len * CELL - 4)) return this.lose();
    } else if (lane?.kind === 'river') {
      const log = lane.items.find((it) => x > it.x && x < it.x + it.len * CELL);
      if (!log) return this.lose();
      this.rideX += lane.speed * dt;
      if (x < 0 || x > W) return this.lose();
    }
    if (this.py === 0) {
      const col = Math.round(this.px + this.rideX / CELL);
      const slot = HOMES.indexOf(col);
      if (slot < 0 || this.homes[slot]) return this.lose();
      this.homes[slot] = true;
      this.addScore(100 + Math.round(this.timer) * 5);
      this.sfx.good();
      if (this.homes.every(Boolean)) {
        this.addScore(500 * this.level);
        this.sfx.win();
        this.level++;
        this.homes = HOMES.map(() => false);
        this.buildLanes();
      }
      this.respawn();
    }
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#14532d';
    ctx.fillRect(0, 0, W, CELL);
    for (const [k, c] of HOMES.entries()) {
      ctx.fillStyle = this.homes[k] ? '#4ade80' : '#052e16';
      ctx.fillRect(c * CELL + 4, 4, CELL - 8, CELL - 8);
    }
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(0, CELL, W, CELL * 5);
    ctx.fillStyle = '#4c1d95';
    ctx.fillRect(0, CELL * 6, W, CELL);
    ctx.fillRect(0, CELL * 12, W, CELL);
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, CELL * 7, W, CELL * 5);
    for (const lane of this.lanes)
      for (const it of lane.items) {
        const y = lane.row * CELL + 6;
        if (lane.kind === 'river') this.roundRect(ctx, it.x, y, it.len * CELL, CELL - 12, 10, '#92400e');
        else this.roundRect(ctx, it.x + 2, y, it.len * CELL - 4, CELL - 12, 6, ['#f43f5e', '#facc15', '#22d3ee', '#fb923c', '#a78bfa'][lane.row % 5]!);
      }
    const x = this.px * CELL + this.rideX;
    this.circle(ctx, x + CELL / 2, this.py * CELL + CELL / 2, CELL * 0.35, '#4ade80');
    this.circle(ctx, x + CELL / 2 - 6, this.py * CELL + CELL / 2 - 6, 4, '#fff');
    this.circle(ctx, x + CELL / 2 + 6, this.py * CELL + CELL / 2 - 6, 4, '#fff');
    this.text(ctx, `Level ${this.level} · ${'♥'.repeat(Math.max(0, this.lives))} · Score ${this.score}`, 10, H - 14, { size: 15 });
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(W - 170, H - 26, 160, 10);
    ctx.fillStyle = this.timer < 8 ? '#ef4444' : '#4ade80';
    ctx.fillRect(W - 170, H - 26, (this.timer / 30) * 160, 10);
  }
}

export default defineGame(
  { key: 'road-crosser', engine: 'CANVAS', aspectRatio: W / H, orientation: 'portrait', maxScore: 1_000_000, controls: [{ action: 'Hop', keys: 'Arrows / WASD / swipe / tap (forward)' }] },
  (host) => new RoadCrosser(host),
);
