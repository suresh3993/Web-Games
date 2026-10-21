import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';

const W = 360;
const H = 640;
const LANES = 3;
const LANE_W = 90;
const OX = (W - LANES * LANE_W) / 2;

interface Block { lane: number; y: number; h: number; coin: boolean }

class LaneDodger extends CanvasGame {
  private lane = 1;
  private drawX = OX + LANE_W * 1.5;
  private blocks: Block[] = [];
  private speed = 260;
  private spawn = 0;
  private stripe = 0;

  constructor(host: GameHost) {
    super(host, { width: W, height: H, background: '#09122b' });
  }

  protected reset() {
    this.lane = 1;
    this.drawX = OX + LANE_W * 1.5;
    this.blocks = [];
    this.speed = 260;
    this.spawn = 0.6;
  }

  protected update(dt: number) {
    const i = this.input;
    if (i.anyHit('ArrowLeft', 'KeyA') || i.swipe === 'left' || i.taps.some((t) => t.x < W / 2)) this.lane = Math.max(0, this.lane - 1);
    if (i.anyHit('ArrowRight', 'KeyD') || i.swipe === 'right' || i.taps.some((t) => t.x >= W / 2)) this.lane = Math.min(LANES - 1, this.lane + 1);
    const target = OX + LANE_W * (this.lane + 0.5);
    this.drawX += (target - this.drawX) * Math.min(1, dt * 18);
    this.speed = 260 + this.time * 6;
    this.addScore(this.speed * dt * 0.05);
    this.stripe = (this.stripe + this.speed * dt) % 50;

    this.spawn -= dt;
    if (this.spawn <= 0) {
      this.spawn = Math.max(0.38, 0.95 - this.time * 0.008);
      // Never block all three lanes in the same wave.
      const blocked = Math.floor(this.random() * LANES);
      this.blocks.push({ lane: blocked, y: -60, h: 50, coin: false });
      if (this.random() < 0.35) this.blocks.push({ lane: (blocked + 1 + Math.floor(this.random() * 2)) % LANES, y: -60, h: 20, coin: true });
    }
    for (const b of this.blocks) b.y += this.speed * dt;
    const carY = H - 120;
    for (const b of this.blocks) {
      if (b.lane !== this.lane || b.y + b.h < carY || b.y > carY + 60) continue;
      if (b.coin) {
        b.y = H + 100;
        this.addScore(25);
        this.sfx.good();
      } else {
        this.sfx.bad();
        this.end('lost', { seconds: Math.round(this.time) });
        return;
      }
    }
    this.blocks = this.blocks.filter((b) => b.y < H + 60);
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#121a3d';
    ctx.fillRect(OX, 0, LANES * LANE_W, H);
    ctx.fillStyle = 'rgba(167,139,250,0.35)';
    for (let l = 1; l < LANES; l++) for (let y = -50 + this.stripe; y < H; y += 50) ctx.fillRect(OX + l * LANE_W - 2, y, 4, 25);
    for (const b of this.blocks) {
      const x = OX + b.lane * LANE_W + 12;
      if (b.coin) this.circle(ctx, x + (LANE_W - 24) / 2, b.y + 10, 10, '#facc15');
      else {
        this.glow(ctx, '#f43f5e', 12);
        this.roundRect(ctx, x, b.y, LANE_W - 24, b.h, 8, '#f43f5e');
        this.noGlow(ctx);
      }
    }
    this.glow(ctx, '#22d3ee', 14);
    this.roundRect(ctx, this.drawX - 22, H - 120, 44, 60, 10, '#22d3ee');
    this.noGlow(ctx);
    this.hud(ctx, `Score ${this.score}`, `${Math.round(this.speed)} km/h`);
    if (this.time < 3) this.text(ctx, 'Tap left/right or use ← →', W / 2, H / 2, { size: 16, align: 'center', color: '#c7d2fe', font: 'body' });
  }
}

export default defineGame(
  { key: 'lane-dodger', engine: 'CANVAS', aspectRatio: W / H, orientation: 'portrait', maxScore: 1_000_000, controls: [{ action: 'Change lane', keys: '← → / tap a side / swipe' }] },
  (host) => new LaneDodger(host),
);
