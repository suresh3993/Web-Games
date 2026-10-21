import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';
import { dist } from '../../kit/util';

const W = 640;
const H = 480;

interface Rock { x: number; y: number; vx: number; vy: number; r: number; shape: number[] }
interface Shot { x: number; y: number; vx: number; vy: number; life: number }

class RockBlaster extends CanvasGame {
  private ship = { x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2 };
  private rocks: Rock[] = [];
  private shots: Shot[] = [];
  private lives = 3;
  private wave = 0;
  private invuln = 0;
  private fireCd = 0;
  private hyperCd = 0;

  constructor(host: GameHost) {
    super(host, { width: W, height: H, background: '#020617' });
  }

  protected reset() {
    this.ship = { x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2 };
    this.rocks = [];
    this.shots = [];
    this.lives = 3;
    this.wave = 0;
    this.invuln = 2;
    this.nextWave();
  }

  private makeRock(x: number, y: number, r: number): Rock {
    const a = this.random() * Math.PI * 2;
    const sp = 40 + this.random() * 60 + this.wave * 6;
    return { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r, shape: Array.from({ length: 10 }, () => 0.75 + this.random() * 0.35) };
  }

  private nextWave() {
    this.wave++;
    for (let k = 0; k < 3 + this.wave; k++) {
      const edge = this.random() < 0.5;
      this.rocks.push(this.makeRock(edge ? 0 : this.random() * W, edge ? this.random() * H : 0, 44));
    }
  }

  private wrap(o: { x: number; y: number }) {
    o.x = (o.x + W) % W;
    o.y = (o.y + H) % H;
  }

  protected update(dt: number) {
    const i = this.input;
    const s = this.ship;
    // Touch: steer toward the pointer and thrust while held; tap to fire.
    if (i.pointer.down) {
      const target = Math.atan2(i.pointer.y - s.y, i.pointer.x - s.x);
      const diff = Math.atan2(Math.sin(target - s.a), Math.cos(target - s.a));
      s.a += Math.max(-4 * dt, Math.min(4 * dt, diff));
      if (dist(i.pointer.x, i.pointer.y, s.x, s.y) > 60) {
        s.vx += Math.cos(s.a) * 260 * dt;
        s.vy += Math.sin(s.a) * 260 * dt;
      }
    }
    if (i.left) s.a -= 4 * dt;
    if (i.right) s.a += 4 * dt;
    if (i.up) {
      s.vx += Math.cos(s.a) * 300 * dt;
      s.vy += Math.sin(s.a) * 300 * dt;
    }
    s.vx *= Math.pow(0.6, dt);
    s.vy *= Math.pow(0.6, dt);
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    this.wrap(s);
    this.fireCd -= dt;
    this.hyperCd = Math.max(0, this.hyperCd - dt);
    if ((i.key('Space') || i.taps.length) && this.fireCd <= 0) {
      this.fireCd = 0.2;
      this.shots.push({ x: s.x + Math.cos(s.a) * 14, y: s.y + Math.sin(s.a) * 14, vx: s.vx + Math.cos(s.a) * 520, vy: s.vy + Math.sin(s.a) * 520, life: 1 });
      this.sfx.beep(880, 0.03, 'square', 0.03);
    }
    if (i.anyHit('ShiftLeft', 'ShiftRight', 'KeyH') && this.hyperCd === 0) {
      s.x = this.random() * W;
      s.y = this.random() * H;
      s.vx = s.vy = 0;
      this.hyperCd = 4;
    }
    for (const sh of this.shots) {
      sh.x += sh.vx * dt;
      sh.y += sh.vy * dt;
      sh.life -= dt;
      this.wrap(sh);
    }
    for (const r of this.rocks) {
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      this.wrap(r);
    }
    const next: Rock[] = [];
    for (const r of this.rocks) {
      const hit = this.shots.find((sh) => sh.life > 0 && dist(sh.x, sh.y, r.x, r.y) < r.r);
      if (!hit) {
        next.push(r);
        continue;
      }
      hit.life = 0;
      this.addScore(r.r > 30 ? 20 : r.r > 15 ? 50 : 100);
      this.sfx.beep(120 + r.r * 2, 0.08, 'sawtooth', 0.04);
      if (r.r > 15) for (let k = 0; k < 2; k++) next.push(this.makeRock(r.x, r.y, r.r / 2));
    }
    this.rocks = next;
    this.shots = this.shots.filter((sh) => sh.life > 0);
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.invuln === 0 && this.rocks.some((r) => dist(r.x, r.y, s.x, s.y) < r.r + 10)) {
      this.lives--;
      this.sfx.bad();
      if (this.lives <= 0) {
        this.end('lost', { wave: this.wave });
        return;
      }
      Object.assign(s, { x: W / 2, y: H / 2, vx: 0, vy: 0 });
      this.invuln = 2.5;
    }
    if (!this.rocks.length) {
      this.addScore(500);
      this.nextWave();
    }
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    for (const r of this.rocks) {
      ctx.beginPath();
      r.shape.forEach((k, n) => {
        const a = (n / r.shape.length) * Math.PI * 2;
        const x = r.x + Math.cos(a) * r.r * k;
        const y = r.y + Math.sin(a) * r.r * k;
        n ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
    }
    for (const sh of this.shots) this.circle(ctx, sh.x, sh.y, 2.5, '#fde047');
    const s = this.ship;
    if (this.invuln === 0 || Math.floor(this.time * 10) % 2 === 0) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.a);
      this.glow(ctx, '#22d3ee', 10);
      ctx.strokeStyle = '#22d3ee';
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-10, -10);
      ctx.lineTo(-5, 0);
      ctx.lineTo(-10, 10);
      ctx.closePath();
      ctx.stroke();
      this.noGlow(ctx);
      if (this.input.up) {
        ctx.strokeStyle = '#f97316';
        ctx.beginPath();
        ctx.moveTo(-6, -4);
        ctx.lineTo(-16, 0);
        ctx.lineTo(-6, 4);
        ctx.stroke();
      }
      ctx.restore();
    }
    this.hud(ctx, `Score ${this.score}  ·  Wave ${this.wave}`, `${'▲'.repeat(Math.max(0, this.lives))}  ${this.hyperCd ? '' : '· hyperspace ready'}`);
  }
}

export default defineGame(
  { key: 'rock-blaster', engine: 'CANVAS', aspectRatio: W / H, orientation: 'landscape', maxScore: 2_000_000, controls: [{ action: 'Rotate / thrust', keys: '← → / ↑ (touch: hold toward a point)' }, { action: 'Fire', keys: 'Space / tap' }, { action: 'Hyperspace', keys: 'Shift / H' }] },
  (host) => new RockBlaster(host),
);
