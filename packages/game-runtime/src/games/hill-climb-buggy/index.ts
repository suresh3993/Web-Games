import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';
import { clamp } from '../../kit/util';

const W = 640;
const H = 400;
const WHEELBASE = 44;
/** The course starts at x = 100; a barrier just behind it stops the buggy reversing off the map. */
const START_X = 40;
const BIOMES = [
  { sky: '#0c1a3a', ground: '#166534', top: '#4ade80' },
  { sky: '#2a1206', ground: '#9a3412', top: '#fb923c' },
  { sky: '#0b1022', ground: '#475569', top: '#e2e8f0' },
];

class HillClimbBuggy extends CanvasGame {
  private waves: { a: number; f: number; p: number }[] = [];
  private x = 100;
  private y = 0;
  private vx = 0;
  private vy = 0;
  private angle = 0;
  private spin = 0;
  private airborne = false;
  private fuel = 100;
  private items: { x: number; kind: 'fuel' | 'coin'; taken: boolean }[] = [];
  private coins = 0;
  private nextItem = 300;

  constructor(host: GameHost) {
    super(host, { width: W, height: H });
  }

  protected reset() {
    this.waves = [
      { a: 40, f: 0.004, p: this.random() * 6 },
      { a: 18, f: 0.011, p: this.random() * 6 },
      { a: 7, f: 0.03, p: this.random() * 6 },
    ];
    this.x = 100;
    this.vx = 0;
    this.vy = 0;
    this.y = this.ground(this.x);
    this.angle = this.slope(this.x);
    this.spin = 0;
    this.airborne = false;
    this.fuel = 100;
    this.items = [];
    this.coins = 0;
    this.nextItem = 300;
  }

  /** Terrain height (canvas y) — hills grow taller with distance. */
  private ground(x: number) {
    const grow = 1 + Math.min(2, x / 6000);
    return 260 - this.waves.reduce((s, w) => s + w.a * grow * Math.sin(w.f * x + w.p), 0);
  }

  private slope(x: number) {
    return Math.atan2(this.ground(x + WHEELBASE / 2) - this.ground(x - WHEELBASE / 2), WHEELBASE);
  }

  protected update(dt: number) {
    const i = this.input;
    const gas = (i.right || i.key('ArrowUp') || (i.pointer.down && i.pointer.x >= W / 2)) && this.fuel > 0;
    const brake = i.left || i.key('ArrowDown') || (i.pointer.down && i.pointer.x < W / 2);
    while (this.nextItem < this.x + W) {
      this.items.push({ x: this.nextItem, kind: this.random() < 0.25 ? 'fuel' : 'coin', taken: false });
      this.nextItem += 140 + this.random() * 200;
    }
    if (!this.airborne) {
      const slope = this.slope(this.x);
      this.angle = slope;
      // Gravity along the slope: screen y points down, so a positive slope (descending to the right) speeds you up.
      let ax = Math.sin(slope) * 520;
      if (gas) ax += 300;
      if (brake) ax -= this.vx > 0 ? 400 : 150;
      this.vx = clamp(this.vx + ax * dt, -180, 520);
      this.vx *= Math.pow(0.85, dt);
      const nextX = this.x + this.vx * dt;
      const expectedY = this.ground(nextX);
      // Launch off crests when the ground falls away faster than the buggy can follow.
      const groundVy = (expectedY - this.y) / dt;
      if (groundVy > 260 && this.vx > 150) {
        this.airborne = true;
        this.vy = Math.sin(this.angle) * this.vx;
        this.spin = 0;
      } else {
        this.y = expectedY;
      }
      this.x = nextX;
    } else {
      this.vy += 700 * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (gas) this.spin -= 3 * dt;
      if (brake) this.spin += 3 * dt;
      this.angle += this.spin * dt;
      if (this.y >= this.ground(this.x)) {
        const diff = this.angle - this.slope(this.x);
        const mismatch = Math.abs(Math.atan2(Math.sin(diff), Math.cos(diff)));
        if (mismatch > 1.2) {
          this.sfx.bad();
          this.end('lost', { metres: Math.round(this.x / 10) });
          return;
        }
        this.airborne = false;
        this.y = this.ground(this.x);
        this.vx *= 0.8;
      }
    }
    // A barrier at the start line: reversing never takes the buggy behind the course.
    if (this.x < START_X) {
      this.x = START_X;
      this.vx = Math.max(0, this.vx);
      if (!this.airborne) this.y = this.ground(this.x);
    }
    if (gas) this.fuel = Math.max(0, this.fuel - dt * 3.2);
    else this.fuel = Math.max(0, this.fuel - dt * 0.6);
    for (const it of this.items) {
      if (it.taken || Math.abs(it.x - this.x) > 20) continue;
      it.taken = true;
      if (it.kind === 'fuel') this.fuel = 100;
      else this.coins++;
      this.sfx.good();
    }
    this.setScore(Math.max(0, this.x - 100) / 10 + this.coins * 20);
    if (this.fuel <= 0 && Math.abs(this.vx) < 5 && !this.airborne) this.end('completed', { metres: Math.round(this.x / 10) });
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    const biome = BIOMES[clamp(Math.floor(this.x / 4000), 0, BIOMES.length - 1)]!;
    ctx.fillStyle = biome.sky;
    ctx.fillRect(0, 0, W, H);
    const camX = this.x - 160;
    const camY = clamp(this.y - 240, -200, 120);
    ctx.save();
    ctx.translate(-camX, -camY);
    ctx.fillStyle = biome.ground;
    ctx.beginPath();
    ctx.moveTo(camX, H + 400);
    for (let x = camX; x <= camX + W + 10; x += 8) ctx.lineTo(x, this.ground(x));
    ctx.lineTo(camX + W + 10, H + 400);
    ctx.fill();
    ctx.strokeStyle = biome.top;
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let x = camX; x <= camX + W + 10; x += 8) (x === camX ? ctx.moveTo(x, this.ground(x)) : ctx.lineTo(x, this.ground(x)));
    ctx.stroke();
    for (const it of this.items) {
      if (it.taken || it.x < camX - 20 || it.x > camX + W + 20) continue;
      const iy = this.ground(it.x) - 26;
      if (it.kind === 'fuel') this.roundRect(ctx, it.x - 8, iy - 10, 16, 20, 3, '#ef4444');
      else this.circle(ctx, it.x, iy, 8, '#facc15');
    }
    // Buggy
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    this.roundRect(ctx, -30, -30, 60, 16, 6, '#22d3ee');
    this.roundRect(ctx, -8, -46, 22, 18, 5, '#a78bfa');
    this.circle(ctx, -WHEELBASE / 2, -6, 11, '#0f172a');
    this.circle(ctx, WHEELBASE / 2, -6, 11, '#0f172a');
    this.circle(ctx, -WHEELBASE / 2, -6, 4, '#94a3b8');
    this.circle(ctx, WHEELBASE / 2, -6, 4, '#94a3b8');
    ctx.restore();
    this.hud(ctx, `${Math.round((this.x - 100) / 10)} m  ·  ${this.coins} coins`, `Fuel ${Math.round(this.fuel)}%`);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(W - 132, 34, 120, 8);
    ctx.fillStyle = this.fuel < 25 ? '#ef4444' : '#4ade80';
    ctx.fillRect(W - 132, 34, this.fuel * 1.2, 8);
    if (this.time < 4) this.text(ctx, '→ gas · ← brake · lean in the air to land flat', W / 2, H - 14, { size: 13, align: 'center', color: '#e2e8f0', font: 'body' });
  }
}

export default defineGame(
  { key: 'hill-climb-buggy', engine: 'CANVAS', aspectRatio: W / H, orientation: 'landscape', maxScore: 500_000, controls: [{ action: 'Gas / lean back', keys: '→ / right half' }, { action: 'Brake / lean forward', keys: '← / left half' }] },
  (host) => new HillClimbBuggy(host),
);
