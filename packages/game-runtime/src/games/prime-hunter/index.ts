import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';
import { dist } from '../../kit/util';

const W = 480;
const H = 640;

export function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
}

interface Bubble { n: number; x: number; y: number; vy: number; r: number; popped: number }

class PrimeHunter extends CanvasGame {
  private bubbles: Bubble[] = [];
  private lives = 3;
  private combo = 0;
  private spawn = 0;
  private level = 1;
  private popups: { text: string; x: number; y: number; t: number; color: string }[] = [];

  constructor(host: GameHost) {
    super(host, { width: W, height: H, background: '#071423' });
  }

  protected reset() {
    this.bubbles = [];
    this.lives = 3;
    this.combo = 0;
    this.spawn = 0;
    this.level = 1;
    this.popups = [];
  }

  private makeNumber() {
    const max = 20 + this.level * 15;
    // Bias toward primes so roughly 40% of bubbles are targets.
    for (let k = 0; k < 20; k++) {
      const n = 2 + Math.floor(this.random() * max);
      if (isPrime(n) === this.random() < 0.4) return n;
    }
    return 2 + Math.floor(this.random() * max);
  }

  protected update(dt: number) {
    this.level = 1 + Math.floor(this.time / 20);
    this.spawn -= dt;
    if (this.spawn <= 0) {
      this.spawn = Math.max(0.45, 1.2 - this.level * 0.08);
      this.bubbles.push({ n: this.makeNumber(), x: 40 + this.random() * (W - 80), y: H + 30, vy: 60 + this.level * 10 + this.random() * 30, r: 28, popped: 0 });
    }
    for (const tap of this.input.taps) {
      const b = this.bubbles.find((x) => !x.popped && dist(tap.x, tap.y, x.x, x.y) < x.r + 6);
      if (!b) continue;
      b.popped = 0.25;
      if (isPrime(b.n)) {
        this.combo++;
        const pts = 10 * Math.min(10, this.combo);
        this.addScore(pts);
        this.popups.push({ text: `+${pts}`, x: b.x, y: b.y, t: 0.7, color: '#4ade80' });
        this.sfx.good();
      } else {
        this.combo = 0;
        this.lives--;
        this.popups.push({ text: `${b.n} isn't prime`, x: b.x, y: b.y, t: 0.9, color: '#fb7185' });
        this.sfx.bad();
      }
    }
    for (const b of this.bubbles) {
      if (b.popped) b.popped -= dt;
      else b.y -= b.vy * dt;
      if (!b.popped && b.y < -30 && isPrime(b.n)) {
        this.combo = 0;
        this.lives--;
        this.popups.push({ text: `missed ${b.n}`, x: b.x, y: 40, t: 0.9, color: '#fb7185' });
        b.y = -999;
      }
    }
    this.bubbles = this.bubbles.filter((b) => (b.popped ? b.popped > 0 : b.y > -40));
    for (const p of this.popups) {
      p.t -= dt;
      p.y -= 30 * dt;
    }
    this.popups = this.popups.filter((p) => p.t > 0);
    if (this.lives <= 0) this.end('lost', { level: this.level });
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    for (const b of this.bubbles) {
      const scale = b.popped ? 1 + (0.25 - b.popped) * 3 : 1;
      ctx.globalAlpha = b.popped ? b.popped * 4 : 1;
      this.circle(ctx, b.x, b.y, b.r * scale, '#1e3a8a');
      ctx.strokeStyle = '#67e8f9';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * scale, 0, Math.PI * 2);
      ctx.stroke();
      this.text(ctx, String(b.n), b.x, b.y + 7, { size: 20, align: 'center' });
    }
    ctx.globalAlpha = 1;
    for (const p of this.popups) this.text(ctx, p.text, p.x, p.y, { size: 15, align: 'center', color: p.color });
    this.hud(ctx, `Score ${this.score}  ·  Combo ×${Math.min(10, this.combo)}`, '♥'.repeat(Math.max(0, this.lives)));
    if (this.time < 4) this.text(ctx, 'Tap only the PRIME numbers!', W / 2, H / 2, { size: 22, align: 'center', color: '#c7d2fe' });
  }
}

export default defineGame(
  { key: 'prime-hunter', engine: 'CANVAS', aspectRatio: W / H, orientation: 'portrait', maxScore: 500_000, controls: [{ action: 'Pop prime', keys: 'Click / tap' }] },
  (host) => new PrimeHunter(host),
);
