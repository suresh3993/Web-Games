import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';
import { clamp, dist } from '../../kit/util';

const W = 420;
const H = 640;
const RIVER_W = 260;

interface Gate { y: number; x: number; width: number; passed: boolean; missed: boolean }
interface Rock { x: number; y: number; r: number }

class SpeedboatRush extends CanvasGame {
  private boatX = W / 2;
  private travelled = 0;
  private gates: Gate[] = [];
  private rocks: Rock[] = [];
  private checkpointTime = 20;
  private nextGate = 300;
  private nextRock = 450;
  private speed = 260;
  private gatesPassed = 0;
  private wake: { x: number; y: number; t: number }[] = [];

  constructor(host: GameHost) {
    super(host, { width: W, height: H, background: '#14532d' });
  }

  protected reset() {
    this.boatX = W / 2;
    this.travelled = 0;
    this.gates = [];
    this.rocks = [];
    this.checkpointTime = 20;
    this.nextGate = 300;
    this.nextRock = 450;
    this.speed = 260;
    this.gatesPassed = 0;
    this.wake = [];
  }

  /** River centre at a world distance (winding course). */
  private centre(d: number) {
    return W / 2 + Math.sin(d * 0.0021) * 70 + Math.sin(d * 0.0057 + 1) * 30;
  }

  /** Screen y of a world distance (the boat sits at y = H - 120). */
  private screenY(d: number) {
    return H - 120 - (d - this.travelled);
  }

  protected update(dt: number) {
    const i = this.input;
    if (i.pointer.down) this.boatX += clamp(i.pointer.x - this.boatX, -300 * dt, 300 * dt);
    if (i.left) this.boatX -= 280 * dt;
    if (i.right) this.boatX += 280 * dt;
    this.speed = 260 + Math.min(220, this.time * 3);
    this.travelled += this.speed * dt;
    const c = this.centre(this.travelled);
    const onBank = Math.abs(this.boatX - c) > RIVER_W / 2 - 14;
    if (onBank) {
      this.travelled -= this.speed * dt * 0.5; // banks slow you down
      this.boatX += (c - this.boatX) * dt * 2;
    }
    while (this.nextGate < this.travelled + H) {
      this.gates.push({ y: this.nextGate, x: this.centre(this.nextGate) + (this.random() - 0.5) * 120, width: 90, passed: false, missed: false });
      this.nextGate += 380 + this.random() * 140;
    }
    while (this.nextRock < this.travelled + H) {
      this.rocks.push({ y: this.nextRock, x: this.centre(this.nextRock) + (this.random() - 0.5) * (RIVER_W - 60), r: 14 + this.random() * 10 });
      this.nextRock += 160 + this.random() * 200;
    }
    for (const g of this.gates) {
      if (g.passed || g.missed || g.y > this.travelled) continue;
      if (Math.abs(this.boatX - g.x) < g.width / 2) {
        g.passed = true;
        this.gatesPassed++;
        this.checkpointTime = Math.min(30, this.checkpointTime + 4);
        this.addScore(100);
        this.sfx.good();
      } else {
        g.missed = true;
        this.checkpointTime -= 3;
        this.sfx.bad();
      }
    }
    for (const r of this.rocks) {
      if (dist(this.boatX, H - 120, r.x, this.screenY(r.y)) < r.r + 12) {
        this.checkpointTime -= 2;
        r.y = -9999;
        this.sfx.bad();
      }
    }
    this.gates = this.gates.filter((g) => g.y > this.travelled - 200);
    this.rocks = this.rocks.filter((r) => r.y > this.travelled - 200);
    this.checkpointTime -= dt;
    this.setScore(this.gatesPassed * 100 + this.travelled / 20);
    if (!this.reducedMotion) this.wake.push({ x: this.boatX, y: this.travelled, t: 0.8 });
    for (const w of this.wake) w.t -= dt;
    this.wake = this.wake.filter((w) => w.t > 0);
    if (this.checkpointTime <= 0) this.end('completed', { gates: this.gatesPassed });
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#0e7490';
    for (let y = 0; y < H; y += 6) {
      const d = this.travelled + (H - 120 - y);
      ctx.fillRect(this.centre(d) - RIVER_W / 2, y, RIVER_W, 6);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (const w of this.wake) ctx.fillRect(w.x - 2, this.screenY(w.y) + 18, 4, 4);
    for (const r of this.rocks) this.circle(ctx, r.x, this.screenY(r.y), r.r, '#64748b');
    for (const g of this.gates) {
      const y = this.screenY(g.y);
      const color = g.passed ? '#4ade80' : g.missed ? '#ef4444' : '#facc15';
      this.circle(ctx, g.x - g.width / 2, y, 8, color);
      this.circle(ctx, g.x + g.width / 2, y, 8, color);
    }
    ctx.save();
    ctx.translate(this.boatX, H - 120);
    this.glow(ctx, '#f8fafc', 8);
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(12, 10);
    ctx.lineTo(-12, 10);
    ctx.closePath();
    ctx.fill();
    this.noGlow(ctx);
    ctx.fillStyle = '#f43f5e';
    ctx.fillRect(-5, -4, 10, 8);
    ctx.restore();
    this.hud(ctx, `Gates ${this.gatesPassed}`, `⏱ ${Math.max(0, Math.ceil(this.checkpointTime))}s`);
    if (this.time < 4) this.text(ctx, 'Steer through yellow gates for extra time', W / 2, 60, { size: 14, align: 'center', color: '#f8fafc', font: 'body' });
  }
}

export default defineGame(
  { key: 'speedboat-rush', engine: 'CANVAS', aspectRatio: W / H, orientation: 'portrait', maxScore: 500_000, controls: [{ action: 'Steer', keys: '← → / drag' }] },
  (host) => new SpeedboatRush(host),
);
