import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';
import { dist } from '../../kit/util';

const W = 640;
const H = 480;
const DURATION = 30;

interface Target { x: number; y: number; r: number; age: number; life: number }

class AimTrainer extends CanvasGame {
  private targets: Target[] = [];
  private hits = 0;
  private shots = 0;
  private spawn = 0;
  private rings: { x: number; y: number; t: number; hit: boolean }[] = [];

  constructor(host: GameHost) {
    super(host, { width: W, height: H, background: '#0a0f24' });
  }

  protected reset() {
    this.targets = [];
    this.hits = 0;
    this.shots = 0;
    this.spawn = 0;
    this.rings = [];
  }

  protected update(dt: number) {
    if (this.time >= DURATION) {
      const accuracy = this.shots ? this.hits / this.shots : 0;
      this.setScore(Math.round(this.hits * 100 * accuracy));
      this.end('completed', { hits: this.hits, accuracy: Math.round(accuracy * 100) });
      return;
    }
    this.spawn -= dt;
    // Targets shrink as you get better.
    const radius = Math.max(12, 34 - this.hits * 0.6);
    if (this.spawn <= 0 && this.targets.length < 3) {
      this.spawn = 0.55;
      this.targets.push({ x: 40 + this.random() * (W - 80), y: 70 + this.random() * (H - 110), r: radius, age: 0, life: 1.8 });
    }
    for (const tap of this.input.taps) {
      this.shots++;
      const t = this.targets.find((x) => dist(tap.x, tap.y, x.x, x.y) <= x.r * (1 - x.age / x.life / 2));
      if (t) {
        this.hits++;
        this.addScore(100);
        this.targets = this.targets.filter((x) => x !== t);
        this.sfx.beep(880, 0.04, 'triangle');
      } else this.sfx.beep(200, 0.03, 'square', 0.03);
      this.rings.push({ x: tap.x, y: tap.y, t: 0.3, hit: !!t });
    }
    for (const t of this.targets) t.age += dt;
    this.targets = this.targets.filter((t) => t.age < t.life);
    for (const r of this.rings) r.t -= dt;
    this.rings = this.rings.filter((r) => r.t > 0);
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    for (const t of this.targets) {
      const r = t.r * (1 - t.age / t.life / 2);
      this.glow(ctx, '#f43f5e', 10);
      this.circle(ctx, t.x, t.y, r, '#f43f5e');
      this.noGlow(ctx);
      this.circle(ctx, t.x, t.y, r * 0.66, '#fff');
      this.circle(ctx, t.x, t.y, r * 0.33, '#f43f5e');
    }
    for (const ring of this.rings) {
      ctx.strokeStyle = ring.hit ? 'rgba(74,222,128,0.8)' : 'rgba(251,113,133,0.8)';
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, (0.3 - ring.t) * 80, 0, Math.PI * 2);
      ctx.stroke();
    }
    const accuracy = this.shots ? Math.round((this.hits / this.shots) * 100) : 100;
    this.hud(ctx, `Hits ${this.hits}  ·  Accuracy ${accuracy}%`, `⏱ ${Math.max(0, Math.ceil(DURATION - this.time))}s`);
  }
}

export default defineGame(
  { key: 'aim-trainer', engine: 'CANVAS', aspectRatio: W / H, orientation: 'landscape', maxScore: 20_000, controls: [{ action: 'Shoot', keys: 'Click / tap targets' }] },
  (host) => new AimTrainer(host),
);
