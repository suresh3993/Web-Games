import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';
import { clamp, overlaps } from '../../kit/util';

const W = 420;
const H = 640;
const ROAD_X = 60;
const ROAD_W = 300;
const LANES = 4;
const CAR_W = 34;
const CAR_H = 60;

interface Car { x: number; y: number; speed: number; color: string; nearMissed: boolean }

class NeonRacer extends CanvasGame {
  private x = W / 2;
  private speed = 300;
  private boost = 0;
  private boosting = 0;
  private traffic: Car[] = [];
  private crashes = 0;
  private invuln = 0;
  private stripe = 0;
  private spawn = 0;
  private distance = 0;

  constructor(host: GameHost) {
    super(host, { width: W, height: H, background: '#0a0620' });
  }

  protected reset() {
    this.x = W / 2;
    this.speed = 300;
    this.boost = 0;
    this.boosting = 0;
    this.traffic = [];
    this.crashes = 0;
    this.invuln = 0;
    this.spawn = 0;
    this.distance = 0;
  }

  protected update(dt: number) {
    const i = this.input;
    const steer = 280;
    if (i.left) this.x -= steer * dt;
    if (i.right) this.x += steer * dt;
    if (i.pointer.down) {
      // Touch: hold the left or right half of the screen.
      this.x += (i.pointer.x < W / 2 ? -1 : 1) * steer * dt;
    }
    this.x = clamp(this.x, ROAD_X + CAR_W / 2, ROAD_X + ROAD_W - CAR_W / 2);
    if ((i.up || i.anyHit('Space')) && this.boost >= 100) {
      this.boosting = 3;
      this.boost = 0;
      this.sfx.beep(220, 0.4, 'sawtooth', 0.04);
    }
    this.boosting = Math.max(0, this.boosting - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    const base = 300 + Math.min(300, this.time * 4);
    this.speed = base * (this.boosting ? 1.6 : 1);
    this.distance += this.speed * dt;
    this.setScore(this.distance / 10);
    this.stripe = (this.stripe + this.speed * dt) % 40;

    this.spawn -= dt;
    if (this.spawn <= 0) {
      this.spawn = Math.max(0.35, 1.1 - this.time * 0.01);
      const lane = Math.floor(this.random() * LANES);
      this.traffic.push({ x: ROAD_X + (lane + 0.5) * (ROAD_W / LANES), y: -CAR_H, speed: 120 + this.random() * 80, color: ['#f472b6', '#facc15', '#4ade80', '#fb923c'][lane]!, nearMissed: false });
    }
    const me = { x: this.x - CAR_W / 2, y: H - 110, w: CAR_W, h: CAR_H };
    for (const c of this.traffic) {
      c.y += (this.speed - c.speed) * dt;
      const box = { x: c.x - CAR_W / 2, y: c.y, w: CAR_W, h: CAR_H };
      if (this.invuln === 0 && !this.boosting && overlaps(me, box)) {
        this.crashes++;
        this.invuln = 1.5;
        c.y = H + 100;
        this.sfx.bad();
        if (this.crashes >= 3) {
          this.end('lost', { distance: Math.round(this.distance) });
          return;
        }
      } else if (!c.nearMissed && Math.abs(box.y - me.y) < CAR_H && Math.abs(c.x - this.x) < CAR_W + 14 && !overlaps(me, box)) {
        c.nearMissed = true;
        this.boost = Math.min(100, this.boost + 20);
        this.addScore(50);
        this.sfx.beep(990, 0.04, 'triangle', 0.03);
      }
    }
    this.traffic = this.traffic.filter((c) => c.y < H + 80);
  }

  private car(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
    this.glow(ctx, color, 14);
    this.roundRect(ctx, x - CAR_W / 2, y, CAR_W, CAR_H, 8, color);
    this.noGlow(ctx);
    ctx.fillStyle = 'rgba(11,16,34,0.7)';
    ctx.fillRect(x - CAR_W / 2 + 5, y + 14, CAR_W - 10, 14);
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#141b3a';
    ctx.fillRect(ROAD_X, 0, ROAD_W, H);
    ctx.fillStyle = '#7c5cff';
    ctx.fillRect(ROAD_X - 4, 0, 4, H);
    ctx.fillRect(ROAD_X + ROAD_W, 0, 4, H);
    ctx.fillStyle = 'rgba(199,210,254,0.35)';
    for (let l = 1; l < LANES; l++) for (let y = -40 + this.stripe; y < H; y += 40) ctx.fillRect(ROAD_X + (l * ROAD_W) / LANES - 2, y, 4, 20);
    for (const c of this.traffic) this.car(ctx, c.x, c.y, c.color);
    if (this.invuln === 0 || Math.floor(this.time * 10) % 2 === 0) this.car(ctx, this.x, H - 110, this.boosting ? '#ffffff' : '#22d3ee');
    this.hud(ctx, `${Math.round(this.distance / 10)} m`, `${'♥'.repeat(3 - this.crashes)}`);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(12, 36, 120, 8);
    ctx.fillStyle = this.boost >= 100 ? '#facc15' : '#22d3ee';
    ctx.fillRect(12, 36, this.boost * 1.2, 8);
    this.text(ctx, this.boost >= 100 ? 'BOOST READY (↑ / Space)' : 'Near misses charge boost', 12, 60, { size: 11, color: '#9aa0c0', font: 'body' });
  }
}

export default defineGame(
  { key: 'neon-racer', engine: 'CANVAS', aspectRatio: W / H, orientation: 'portrait', maxScore: 2_000_000, controls: [{ action: 'Steer', keys: '← → / hold screen side' }, { action: 'Boost', keys: '↑ / Space' }] },
  (host) => new NeonRacer(host),
);
