import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';
import { collideBodies, type Body } from '../../kit/physics';

const W = 480;
const H = 640;
const DURATION = 60;
const START = { x: 240, y: 540 };
const GRAVITY = 900;

class HoopShot extends CanvasGame {
  private ball: Body = { x: START.x, y: START.y, vx: 0, vy: 0, r: 16 };
  private flying = false;
  private touchedRim = false;
  private scoredThisShot = false;
  private hoop = { x: 240, y: 200 };
  private baskets = 0;
  private drag: { x: number; y: number } | null = null;
  private message = '';
  private messageT = 0;

  constructor(host: GameHost) {
    super(host, { width: W, height: H, background: '#1c1917' });
  }

  protected reset() {
    this.baskets = 0;
    this.hoop = { x: 240, y: 200 };
    this.resetBall();
  }

  private resetBall() {
    this.ball = { x: START.x, y: START.y, vx: 0, vy: 0, r: 16 };
    this.flying = false;
    this.touchedRim = false;
    this.scoredThisShot = false;
  }

  private rims(): Body[] {
    return [
      { x: this.hoop.x - 34, y: this.hoop.y, vx: 0, vy: 0, r: 4, m: Infinity },
      { x: this.hoop.x + 34, y: this.hoop.y, vx: 0, vy: 0, r: 4, m: Infinity },
    ];
  }

  protected update(dt: number) {
    if (this.time >= DURATION) {
      this.end('completed', { baskets: this.baskets });
      return;
    }
    if (this.baskets >= 10) this.hoop.x = 240 + Math.sin(this.time * 1.4) * 140;
    const i = this.input;
    if (!this.flying) {
      if (i.taps.length) this.drag = { ...i.taps[0]! };
      const rel = i.releases[0];
      if (this.drag && rel) {
        // Slingshot: pull back from the ball, release to launch the opposite way.
        const dx = this.drag.x - rel.x;
        const dy = this.drag.y - rel.y;
        if (Math.hypot(dx, dy) > 20) {
          this.ball.vx = dx * 4.2;
          this.ball.vy = dy * 4.2;
          this.flying = true;
          this.sfx.click();
        }
        this.drag = null;
      }
      if (i.anyHit('Space')) {
        // Keyboard: a fixed, reasonable shot toward the hoop.
        const t = 0.9;
        this.ball.vx = (this.hoop.x - this.ball.x) / t;
        this.ball.vy = (this.hoop.y - 60 - this.ball.y - 0.5 * GRAVITY * t * t) / t;
        this.flying = true;
      }
      return;
    }
    const prevY = this.ball.y;
    this.ball.vy += GRAVITY * dt;
    this.ball.x += this.ball.vx * dt;
    this.ball.y += this.ball.vy * dt;
    for (const rim of this.rims()) if (collideBodies(rim, this.ball, 0.6)) {
      this.touchedRim = true;
      this.sfx.beep(330, 0.03, 'triangle', 0.03);
    }
    // Backboard
    const board = { x: this.hoop.x + 44, top: this.hoop.y - 90 };
    if (this.ball.x + this.ball.r > board.x && this.ball.x < board.x + 8 && this.ball.y > board.top && this.ball.y < this.hoop.y + 10 && this.ball.vx > 0) {
      this.ball.vx *= -0.6;
      this.ball.x = board.x - this.ball.r;
    }
    // Basket: crossing the rim plane downward between the rims.
    if (!this.scoredThisShot && prevY < this.hoop.y && this.ball.y >= this.hoop.y && this.ball.vy > 0 && Math.abs(this.ball.x - this.hoop.x) < 28) {
      this.scoredThisShot = true;
      this.baskets++;
      const swish = !this.touchedRim;
      this.addScore(swish ? 30 : 20);
      this.message = swish ? 'SWISH! +30' : 'Basket! +20';
      this.messageT = 1;
      this.sfx.good();
    }
    if (this.ball.y > H + 40 || this.ball.x < -60 || this.ball.x > W + 60) this.resetBall();
    this.messageT = Math.max(0, this.messageT - dt);
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#7c2d12';
    ctx.fillRect(0, H - 60, W, 60);
    const board = { x: this.hoop.x + 44, top: this.hoop.y - 90 };
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(board.x, board.top, 8, 110);
    ctx.fillStyle = 'rgba(248,250,252,0.15)';
    ctx.fillRect(this.hoop.x - 34, this.hoop.y, 68, 40);
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(this.hoop.x - 34, this.hoop.y);
    ctx.lineTo(this.hoop.x + 34, this.hoop.y);
    ctx.stroke();
    this.circle(ctx, this.ball.x, this.ball.y, this.ball.r, '#ea580c');
    ctx.strokeStyle = '#1c1917';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.ball.x, this.ball.y, this.ball.r, 0, Math.PI * 2);
    ctx.moveTo(this.ball.x - this.ball.r, this.ball.y);
    ctx.lineTo(this.ball.x + this.ball.r, this.ball.y);
    ctx.stroke();
    if (!this.flying && this.drag && this.input.pointer.down) {
      ctx.strokeStyle = '#facc15';
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(this.ball.x, this.ball.y);
      ctx.lineTo(this.ball.x + (this.drag.x - this.input.pointer.x), this.ball.y + (this.drag.y - this.input.pointer.y));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    this.hud(ctx, `Baskets ${this.baskets}  ·  ${this.score} pts`, `⏱ ${Math.max(0, Math.ceil(DURATION - this.time))}s`);
    if (this.messageT > 0) this.text(ctx, this.message, W / 2, 110, { size: 24, align: 'center', color: '#facc15' });
    if (this.time < 4) this.text(ctx, 'Pull back and release to shoot', W / 2, H - 80, { size: 15, align: 'center', color: '#fde68a', font: 'body' });
  }
}

export default defineGame(
  { key: 'hoop-shot', engine: 'CANVAS', aspectRatio: W / H, orientation: 'portrait', maxScore: 5_000, controls: [{ action: 'Shoot', keys: 'Drag back & release / Space' }] },
  (host) => new HoopShot(host),
);
