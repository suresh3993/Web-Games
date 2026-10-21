import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';
import { clamp } from '../../kit/util';

const W = 640;
const H = 420;
const GOAL = { x: 170, y: 80, w: 300, h: 130 };
const ROUNDS = 5;
const MAX_SCORE = 3_300;

type Phase = 'aim' | 'shot' | 'defend' | 'cpu-shot' | 'result';

class PenaltyShootout extends CanvasGame {
  private phase: Phase = 'aim';
  private round = 1;
  private goals = [0, 0];
  private ball = { x: W / 2, y: 360, tx: 0, ty: 0, t: 0 };
  private keeperX = W / 2;
  private keeperTarget = W / 2;
  private dragStart: { x: number; y: number } | null = null;
  private dive: -1 | 0 | 1 | null = null;
  private message = 'Drag from the ball toward the goal and release to shoot.';
  private resultTimer = 0;
  private turn: 'you' | 'cpu' = 'you';

  constructor(host: GameHost) {
    super(host, { width: W, height: H, background: '#166534' });
  }

  protected reset() {
    this.phase = 'aim';
    this.round = 1;
    this.goals = [0, 0];
    this.turn = 'you';
    this.resetBall();
  }

  private resetBall() {
    this.ball = { x: W / 2, y: 360, tx: 0, ty: 0, t: 0 };
    this.keeperX = this.keeperTarget = W / 2;
    this.dive = null;
    this.dragStart = null;
  }

  private shoot(tx: number, ty: number) {
    this.ball.tx = tx;
    this.ball.ty = ty;
    this.ball.t = 0;
    this.sfx.beep(180, 0.08, 'square', 0.05);
  }

  private decide(scored: boolean) {
    if (this.turn === 'you') {
      if (scored) this.goals[0]!++;
      this.message = scored ? 'GOAL! ⚽ Now defend — press ← ↓ → or tap where to dive.' : 'Saved / missed! Now defend.';
      if (scored) this.sfx.good();
      else this.sfx.bad();
      this.turn = 'cpu';
    } else {
      if (scored) this.goals[1]!++;
      this.message = scored ? 'The computer scores.' : 'Great save! 🧤';
      if (!scored) this.sfx.good();
      this.turn = 'you';
      this.round++;
    }
    this.phase = 'result';
    this.resultTimer = 1.4;
  }

  private checkEnd(): boolean {
    const [you, cpu] = this.goals as [number, number];
    const taken = this.round - 1;
    if (this.turn !== 'you') return false; // decide after each full round
    const remaining = Math.max(0, ROUNDS - taken);
    const decided = taken >= ROUNDS ? you !== cpu : you > cpu + remaining || cpu > you + remaining;
    if (!decided) return false;
    const won = you > cpu;
    // Clamped so long sudden-death shootouts can never exceed the declared maximum.
    this.setScore(Math.min(MAX_SCORE, won ? 300 + you * 100 + (taken - cpu) * 50 : you * 50));
    this.message = won ? `You win ${you}–${cpu}! 🏆` : `You lose ${you}–${cpu}.`;
    if (won) this.sfx.win();
    this.end(won ? 'won' : 'lost', { for: you, against: cpu });
    return true;
  }

  protected update(dt: number) {
    const i = this.input;
    this.keeperX += clamp(this.keeperTarget - this.keeperX, -620 * dt, 620 * dt);
    if (this.phase === 'result') {
      this.resultTimer -= dt;
      if (this.resultTimer <= 0) {
        if (this.checkEnd()) return;
        this.resetBall();
        if (this.turn === 'you') {
          this.phase = 'aim';
          this.message = `Round ${this.round}: your shot.`;
        } else {
          this.phase = 'defend';
          // The computer shoots after a short delay; dive before it arrives.
          this.after(0.9, () => {
            const corner = Math.floor(this.random() * 3) - 1;
            this.shoot(W / 2 + corner * 110 + (this.random() - 0.5) * 40, GOAL.y + 30 + this.random() * 80);
            this.phase = 'cpu-shot';
          });
        }
      }
      return;
    }
    if (this.phase === 'aim') {
      if (i.taps.length) this.dragStart = { x: i.taps[0]!.x, y: i.taps[0]!.y };
      const rel = i.releases[0];
      if (this.dragStart && rel) {
        const dx = rel.x - this.dragStart.x;
        const dy = rel.y - this.dragStart.y;
        if (dy < -20) {
          const power = clamp(-dy / 220, 0.4, 1.2);
          this.shoot(W / 2 + dx * 1.6, 360 + dy * power * 1.6);
          this.phase = 'shot';
          // Keeper guesses a side (biased toward the shot sometimes).
          const guess = this.random() < 0.45 ? Math.sign(dx) : Math.floor(this.random() * 3) - 1;
          this.keeperTarget = W / 2 + guess * 105;
        }
        this.dragStart = null;
      }
      // Keyboard: aim with arrows + Space.
      if (i.anyHit('Space', 'Enter')) {
        const dir = i.left ? -1 : i.right ? 1 : 0;
        this.shoot(W / 2 + dir * 120, GOAL.y + 40 + (i.up ? -10 : 40));
        this.phase = 'shot';
        this.keeperTarget = W / 2 + (Math.floor(this.random() * 3) - 1) * 105;
      }
    }
    if (this.phase === 'defend' || this.phase === 'cpu-shot') {
      if (this.dive === null) {
        const tap = i.taps[0];
        if (i.anyHit('ArrowLeft', 'KeyA') || (tap && tap.x < W / 2 - 60)) this.dive = -1;
        else if (i.anyHit('ArrowRight', 'KeyD') || (tap && tap.x > W / 2 + 60)) this.dive = 1;
        else if (i.anyHit('ArrowDown', 'ArrowUp', 'KeyS', 'Space') || tap) this.dive = 0;
        if (this.dive !== null) this.keeperTarget = W / 2 + this.dive * 105;
      }
    }
    if (this.phase === 'shot' || this.phase === 'cpu-shot') {
      this.ball.t += dt * 1.8;
      if (this.ball.t >= 1) {
        const bx = this.ball.tx;
        const by = this.ball.ty;
        const onTarget = bx > GOAL.x + 8 && bx < GOAL.x + GOAL.w - 8 && by > GOAL.y + 6 && by < GOAL.y + GOAL.h;
        const saved = Math.abs(bx - this.keeperX) < 60;
        this.decide(onTarget && !saved);
      }
    }
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#15803d';
    for (let k = 0; k < 8; k++) if (k % 2) ctx.fillRect(0, k * 55, W, 55);
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 6;
    ctx.strokeRect(GOAL.x, GOAL.y, GOAL.w, GOAL.h);
    ctx.strokeStyle = 'rgba(248,250,252,0.25)';
    ctx.lineWidth = 1;
    for (let x = GOAL.x; x < GOAL.x + GOAL.w; x += 15) {
      ctx.beginPath();
      ctx.moveTo(x, GOAL.y);
      ctx.lineTo(x, GOAL.y + GOAL.h);
      ctx.stroke();
    }
    // Keeper
    const ky = GOAL.y + GOAL.h - 50;
    this.roundRect(ctx, this.keeperX - 26, ky, 52, 50, 10, this.turn === 'cpu' ? '#22d3ee' : '#f97316');
    this.circle(ctx, this.keeperX, ky - 12, 13, '#fde68a');
    // Ball (interpolated along a gentle arc)
    const t = Math.min(1, this.ball.t);
    const bx = this.ball.x + (this.ball.tx - this.ball.x) * t;
    const by = this.ball.y + (this.ball.ty - this.ball.y) * t - Math.sin(t * Math.PI) * 40;
    const r = 12 - t * 4;
    this.circle(ctx, bx, by, r, '#f8fafc');
    this.circle(ctx, bx, by, r * 0.4, '#0f172a');
    if (this.phase === 'aim' && this.input.pointer.down && this.dragStart) {
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(W / 2, 360);
      ctx.lineTo(W / 2 + (this.input.pointer.x - this.dragStart.x) * 1.6, 360 + (this.input.pointer.y - this.dragStart.y) * 1.6);
      ctx.stroke();
    }
    this.hud(ctx, `You ${this.goals[0]} – ${this.goals[1]} CPU`, `Round ${Math.min(this.round, 99)}`);
    this.text(ctx, this.message, W / 2, H - 14, { size: 14, align: 'center', color: '#f8fafc', font: 'body' });
  }
}

export default defineGame(
  { key: 'penalty-shootout', engine: 'CANVAS', aspectRatio: W / H, orientation: 'landscape', maxScore: MAX_SCORE, controls: [{ action: 'Shoot', keys: 'Drag & release / arrows + Space' }, { action: 'Dive', keys: '← ↓ → / tap a side' }] },
  (host) => new PenaltyShootout(host),
);
