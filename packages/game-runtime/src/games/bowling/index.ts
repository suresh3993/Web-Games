import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';
import { applyFriction, collideBodies, speed, type Body } from '../../kit/physics';
import { clamp } from '../../kit/util';
import { frameTotals, framesOf, gameComplete } from './scoring';

const W = 360;
const H = 640;
const LANE_X = 90;
const LANE_W = 180;
const HEAD_Y = 120;

interface Pin extends Body {
  home: { x: number; y: number };
  down: boolean;
}

class Bowling extends CanvasGame {
  private rolls: number[] = [];
  private pins: Pin[] = [];
  private ball: Body = { x: W / 2, y: H - 80, vx: 0, vy: 0, r: 13, m: 6 };
  private spin = 0;
  private phase: 'aim' | 'rolling' | 'settle' = 'aim';
  private settleT = 0;
  private standingBefore = 10;
  private drag: { x: number; y: number } | null = null;
  private gutter = false;
  private message = '';

  constructor(host: GameHost) {
    super(host, { width: W, height: H, background: '#1c1917' });
  }

  protected reset() {
    this.rolls = [];
    this.rack();
    this.newBall();
  }

  private rack() {
    this.pins = [];
    for (let row = 0; row < 4; row++)
      for (let k = 0; k <= row; k++) {
        const x = W / 2 + (k - row / 2) * 30;
        const y = HEAD_Y - row * 26;
        this.pins.push({ x, y, vx: 0, vy: 0, r: 8, m: 1.5, home: { x, y }, down: false });
      }
  }

  private newBall() {
    this.ball = { x: W / 2, y: H - 80, vx: 0, vy: 0, r: 13, m: 6 };
    this.spin = 0;
    this.phase = 'aim';
    this.gutter = false;
    this.standingBefore = this.pins.filter((p) => !p.down).length;
  }

  private roll(vy: number, vx: number, spin: number) {
    this.ball.vy = -clamp(vy, 260, 820);
    this.ball.vx = clamp(vx, -60, 60);
    this.spin = clamp(spin, -1, 1);
    this.phase = 'rolling';
    this.sfx.beep(110, 0.3, 'sawtooth', 0.03);
  }

  private settle() {
    // A pin counts as down if it moved noticeably from its spot.
    for (const p of this.pins) if (!p.down && Math.hypot(p.x - p.home.x, p.y - p.home.y) > 7) p.down = true;
    const standing = this.pins.filter((p) => !p.down).length;
    const knocked = this.standingBefore - standing;
    this.rolls.push(knocked);
    const frames = framesOf(this.rolls);
    const frameIdx = frames.length - 1;
    const frame = frames[frameIdx]!;
    this.message = knocked === 10 && frame.length === 1 ? 'STRIKE!' : standing === 0 ? 'Spare!' : this.gutter ? 'Gutter ball' : `${knocked} pin${knocked === 1 ? '' : 's'}`;
    if (knocked >= 9) this.sfx.good();
    const totals = frameTotals(this.rolls);
    this.setScore(totals.filter((t): t is number => t !== null).at(-1) ?? 0);
    if (gameComplete(this.rolls)) {
      this.setScore(frameTotals(this.rolls).at(-1) ?? 0);
      this.end('completed', { frames: 10 });
      return;
    }
    // Re-rack after a completed frame (or in the 10th after strikes/spares).
    const inTenth = frameIdx === 9;
    const frameDone = !inTenth && (frame.length === 2 || frame[0] === 10);
    const tenthReset = inTenth && standing === 0;
    if (frameDone || tenthReset) this.rack();
    else for (const p of this.pins) if (p.down) p.x = -100; // clear fallen pins
    this.newBall();
  }

  protected update(dt: number) {
    const i = this.input;
    if (this.phase === 'aim') {
      if (i.left) this.ball.x -= 120 * dt;
      if (i.right) this.ball.x += 120 * dt;
      this.ball.x = clamp(this.ball.x, LANE_X + 16, LANE_X + LANE_W - 16);
      if (i.taps.length) this.drag = { ...i.taps[0]! };
      const rel = i.releases[0];
      if (this.drag && rel) {
        const dy = this.drag.y - rel.y;
        const dx = rel.x - this.drag.x;
        if (dy > 30) this.roll(dy * 3.2, dx * 0.3, dx / 120);
        else this.ball.x = clamp(rel.x, LANE_X + 16, LANE_X + LANE_W - 16);
        this.drag = null;
      }
      if (i.anyHit('Space', 'ArrowUp')) this.roll(640, 0, i.key('KeyQ') ? -0.6 : i.key('KeyE') ? 0.6 : 0);
      return;
    }
    // Hook: spin bends the ball's path as it travels.
    if (!this.gutter) this.ball.vx += this.spin * 90 * dt;
    const steps = 4;
    for (let s = 0; s < steps; s++) {
      for (const b of [this.ball, ...this.pins]) {
        b.x += (b.vx * dt) / steps;
        b.y += (b.vy * dt) / steps;
      }
      if (!this.gutter && (this.ball.x < LANE_X || this.ball.x > LANE_X + LANE_W)) {
        this.gutter = true;
        this.ball.vx = 0;
        this.ball.x = this.ball.x < LANE_X ? LANE_X - 10 : LANE_X + LANE_W + 10;
      }
      if (!this.gutter) for (const p of this.pins) if (p.x > 0) collideBodies(this.ball, p, 0.7);
      for (let a = 0; a < this.pins.length; a++)
        for (let b = a + 1; b < this.pins.length; b++) if (this.pins[a]!.x > 0 && this.pins[b]!.x > 0) collideBodies(this.pins[a]!, this.pins[b]!, 0.7);
    }
    for (const p of this.pins) applyFriction(p, 0.15, dt, 5);
    if (this.ball.y < 30 || this.phase === 'settle') {
      this.ball.vx = this.ball.vy = 0;
      this.ball.y = -50;
      if (this.phase !== 'settle') {
        this.phase = 'settle';
        this.settleT = 1.2;
      }
    }
    if (this.phase === 'settle') {
      this.settleT -= dt;
      if (this.settleT <= 0 || this.pins.every((p) => speed(p) === 0)) {
        if (this.settleT <= 0) this.settle();
      }
    }
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#d6a96b';
    ctx.fillRect(LANE_X, 0, LANE_W, H);
    ctx.fillStyle = '#44403c';
    ctx.fillRect(LANE_X - 20, 0, 20, H);
    ctx.fillRect(LANE_X + LANE_W, 0, 20, H);
    ctx.fillStyle = 'rgba(120,53,15,0.5)';
    for (let k = 1; k < 7; k++) {
      const x = LANE_X + (k * LANE_W) / 7;
      ctx.beginPath();
      ctx.moveTo(x, H - 200);
      ctx.lineTo(x - 5, H - 185);
      ctx.lineTo(x + 5, H - 185);
      ctx.fill();
    }
    for (const p of this.pins) {
      if (p.x < 0) continue;
      this.circle(ctx, p.x, p.y, p.r, p.down ? '#a8a29e' : '#fafaf9');
      this.circle(ctx, p.x, p.y, 3, '#dc2626');
    }
    if (this.ball.y > 0) this.circle(ctx, this.ball.x, this.ball.y, this.ball.r, '#4338ca');
    if (this.phase === 'aim' && this.drag && this.input.pointer.down) {
      ctx.strokeStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(this.ball.x, this.ball.y);
      ctx.lineTo(this.ball.x + (this.input.pointer.x - this.drag.x) * 0.5, this.ball.y - (this.drag.y - this.input.pointer.y));
      ctx.stroke();
    }
    // Scorecard
    const frames = framesOf(this.rolls);
    const totals = frameTotals(this.rolls);
    for (let f = 0; f < 10; f++) {
      const x = 4 + f * 35;
      ctx.strokeStyle = '#a8a29e';
      ctx.strokeRect(x, H - 44, 34, 40);
      const fr = frames[f] ?? [];
      this.text(ctx, fr.map((v, k) => (v === 10 && (f < 9 || k === 0 || fr[k - 1] === 10) ? 'X' : k > 0 && fr[k - 1]! + v === 10 && fr[k - 1] !== 10 ? '/' : String(v))).join(' '), x + 17, H - 30, { size: 10, align: 'center', font: 'body' });
      const t = totals[f];
      if (t !== undefined && t !== null) this.text(ctx, String(t), x + 17, H - 10, { size: 12, align: 'center' });
    }
    this.text(ctx, this.message, W / 2, 30, { size: 20, align: 'center', color: '#facc15' });
    if (this.phase === 'aim' && this.time < 5) this.text(ctx, 'Tap to position · swipe up to roll (curve the swipe for hook)', W / 2, H - 60, { size: 11, align: 'center', color: '#fef3c7', font: 'body' });
  }
}

export default defineGame(
  { key: 'bowling', engine: 'CANVAS', aspectRatio: W / H, orientation: 'portrait', maxScore: 300, controls: [{ action: 'Position', keys: '← → / tap' }, { action: 'Roll', keys: 'Swipe up / Space (Q/E for hook)' }] },
  (host) => new Bowling(host),
);
