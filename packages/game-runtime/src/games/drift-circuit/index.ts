import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';
import { closestPointOnSegment } from '../../kit/physics';

const W = 640;
const H = 480;
const TRACK_W = 90;
const LAPS = 3;
const CHECKPOINTS = 12;

/** Smooth closed track: a wobbly loop built from a few harmonics. */
export function makeTrack(random: () => number): { x: number; y: number }[] {
  const harmonics = Array.from({ length: 3 }, (_, k) => ({ a: 0.12 + random() * 0.18, f: k + 2, p: random() * Math.PI * 2 }));
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < 160; i++) {
    const t = (i / 160) * Math.PI * 2;
    const r = 1 + harmonics.reduce((s, h) => s + h.a * Math.sin(h.f * t + h.p), 0);
    pts.push({ x: Math.cos(t) * 900 * r, y: Math.sin(t) * 620 * r });
  }
  return pts;
}

class DriftCircuit extends CanvasGame {
  private track: { x: number; y: number }[] = [];
  private car = { x: 0, y: 0, angle: 0, vx: 0, vy: 0 };
  private lap = 1;
  private nextCheckpoint = 1;
  private lapStart = 0;
  private bestLap = Infinity;
  private skid: { x: number; y: number; t: number }[] = [];
  private offTrack = false;

  constructor(host: GameHost) {
    super(host, { width: W, height: H, background: '#14532d' });
  }

  protected reset() {
    this.track = makeTrack(this.random);
    const a = this.track[0]!;
    const b = this.track[1]!;
    this.car = { x: a.x, y: a.y, angle: Math.atan2(b.y - a.y, b.x - a.x), vx: 0, vy: 0 };
    this.lap = 1;
    this.nextCheckpoint = 1;
    this.lapStart = 0;
    this.bestLap = Infinity;
    this.skid = [];
  }

  private distanceToTrack(x: number, y: number): { d: number; index: number } {
    let best = { d: Infinity, index: 0 };
    for (let i = 0; i < this.track.length; i++) {
      const a = this.track[i]!;
      const b = this.track[(i + 1) % this.track.length]!;
      const c = closestPointOnSegment(x, y, { x1: a.x, y1: a.y, x2: b.x, y2: b.y });
      const d = Math.hypot(x - c.x, y - c.y);
      if (d < best.d) best = { d, index: i };
    }
    return best;
  }

  protected update(dt: number) {
    const i = this.input;
    const c = this.car;
    const fx = Math.cos(c.angle);
    const fy = Math.sin(c.angle);
    // Touch: steer toward the pointer side, accelerate while held.
    const touchSteer = i.pointer.down ? (i.pointer.x < W / 2 ? -1 : 1) : 0;
    const throttle = i.up || i.pointer.down ? 1 : i.down ? -0.6 : 0;
    const steer = (i.left ? -1 : 0) + (i.right ? 1 : 0) + touchSteer;
    const drifting = i.key('Space') || i.key('ShiftLeft');
    const forward = c.vx * fx + c.vy * fy;
    c.angle += steer * dt * (1.6 + Math.min(1.4, Math.abs(forward) / 300)) * Math.sign(forward || 1) * (Math.abs(forward) > 15 ? 1 : 0);
    const { d, index } = this.distanceToTrack(c.x, c.y);
    this.offTrack = d > TRACK_W / 2;
    const accel = this.offTrack ? 160 : 380;
    c.vx += fx * throttle * accel * dt;
    c.vy += fy * throttle * accel * dt;
    // Split velocity into forward and lateral parts; grip kills lateral speed (less while drifting).
    const nfx = Math.cos(c.angle);
    const nfy = Math.sin(c.angle);
    const fwd = c.vx * nfx + c.vy * nfy;
    const lat = -c.vx * nfy + c.vy * nfx;
    const grip = drifting ? 0.9 : 0.12;
    const latAfter = lat * Math.pow(grip, dt * 10);
    const drag = this.offTrack ? 0.45 : 0.82;
    const fwdAfter = fwd * Math.pow(drag, dt);
    c.vx = nfx * fwdAfter - nfy * latAfter;
    c.vy = nfy * fwdAfter + nfx * latAfter;
    const max = this.offTrack ? 160 : 520;
    const sp = Math.hypot(c.vx, c.vy);
    if (sp > max) {
      c.vx *= max / sp;
      c.vy *= max / sp;
    }
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    if (Math.abs(latAfter) > 60 && !this.reducedMotion) this.skid.push({ x: c.x, y: c.y, t: 2 });
    for (const s of this.skid) s.t -= dt;
    this.skid = this.skid.filter((s) => s.t > 0).slice(-300);

    // Checkpoints in order prevent shortcuts.
    const cp = Math.floor((index / this.track.length) * CHECKPOINTS);
    if (cp === this.nextCheckpoint % CHECKPOINTS) {
      this.nextCheckpoint++;
      if (this.nextCheckpoint > CHECKPOINTS) {
        const lapTime = this.time - this.lapStart;
        this.bestLap = Math.min(this.bestLap, lapTime);
        this.lapStart = this.time;
        this.nextCheckpoint = 1;
        this.sfx.good();
        if (this.lap >= LAPS) {
          this.setScore(Math.max(100, Math.round(20000 - this.time * 100)));
          this.sfx.win();
          this.end('completed', { totalSeconds: Math.round(this.time), bestLap: Math.round(this.bestLap * 10) / 10 });
          return;
        }
        this.lap++;
      }
    }
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(W / 2 - this.car.x, H / 2 - this.car.y);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = TRACK_W + 10;
    ctx.beginPath();
    this.track.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = TRACK_W;
    ctx.stroke();
    // Start line
    const s0 = this.track[0]!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(s0.x - 6, s0.y - TRACK_W / 2, 12, TRACK_W);
    ctx.fillStyle = 'rgba(15,23,42,0.6)';
    for (const s of this.skid) ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
    ctx.translate(this.car.x, this.car.y);
    ctx.rotate(this.car.angle);
    this.glow(ctx, '#f43f5e', 10);
    this.roundRect(ctx, -18, -10, 36, 20, 5, '#f43f5e');
    this.noGlow(ctx);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(2, -7, 9, 14);
    ctx.restore();
    const lapTime = this.time - this.lapStart;
    this.hud(ctx, `Lap ${this.lap}/${LAPS}  ·  ${lapTime.toFixed(1)}s`, this.bestLap < Infinity ? `Best ${this.bestLap.toFixed(1)}s` : '');
    if (this.offTrack) this.text(ctx, 'Off track!', W / 2, 60, { size: 18, align: 'center', color: '#facc15' });
    if (this.time < 4) this.text(ctx, '↑ accelerate · ←→ steer · Space drift', W / 2, H - 20, { size: 14, align: 'center', color: '#e2e8f0', font: 'body' });
  }
}

export default defineGame(
  { key: 'drift-circuit', engine: 'CANVAS', aspectRatio: W / H, orientation: 'landscape', maxScore: 20_000, controls: [{ action: 'Drive', keys: '↑ ↓ ← →' }, { action: 'Drift', keys: 'Space / Shift' }, { action: 'Touch', keys: 'Hold a screen side to steer + accelerate' }] },
  (host) => new DriftCircuit(host),
);
