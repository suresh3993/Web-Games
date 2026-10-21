import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';
import { clamp } from '../../kit/util';

const W = 640;
const H = 400;
const GROUND = 350;
const NET = { x: W / 2, top: 230 };
const TARGET = 7;
const GRAVITY = 700;

interface Player { x: number; y: number; vy: number }

class VolleyRally extends CanvasGame {
  private me: Player = { x: 160, y: GROUND, vy: 0 };
  private cpu: Player = { x: 480, y: GROUND, vy: 0 };
  private ball = { x: 160, y: 120, vx: 0, vy: 0 };
  private scores = [0, 0];
  private serveTimer = 0;
  private lastTouch = -1;
  private message = '';

  constructor(host: GameHost) {
    super(host, { width: W, height: H, background: '#38bdf8' });
  }

  protected reset() {
    this.scores = [0, 0];
    this.serve(0);
  }

  private serve(side: number) {
    this.ball = { x: side === 0 ? 160 : 480, y: 100, vx: 0, vy: 0 };
    this.me = { x: 160, y: GROUND, vy: 0 };
    this.cpu = { x: 480, y: GROUND, vy: 0 };
    this.serveTimer = 0.8;
    this.lastTouch = -1;
  }

  private movePlayer(p: Player, dir: number, jump: boolean, minX: number, maxX: number, dt: number) {
    p.x = clamp(p.x + dir * 300 * dt, minX, maxX);
    if (jump && p.y >= GROUND) p.vy = -430;
    p.vy += GRAVITY * 1.4 * dt;
    p.y = Math.min(GROUND, p.y + p.vy * dt);
    if (p.y >= GROUND) p.vy = 0;
  }

  /** Ball vs player (head-and-arms circle). A hit while airborne above the net is a spike. */
  private touch(p: Player, side: number) {
    const cx = p.x;
    const cy = p.y - 50;
    const dx = this.ball.x - cx;
    const dy = this.ball.y - cy;
    const d = Math.hypot(dx, dy);
    if (d > 36 || d === 0) return;
    const nx = dx / d;
    const ny = dy / d;
    this.ball.x = cx + nx * 36;
    this.ball.y = cy + ny * 36;
    const spike = p.y < GROUND - 40 && this.ball.y < NET.top;
    const towardNet = side === 0 ? 1 : -1;
    if (spike) {
      this.ball.vx = towardNet * 420;
      this.ball.vy = 260;
      this.sfx.beep(180, 0.08, 'square', 0.05);
    } else {
      const sp = Math.max(420, Math.hypot(this.ball.vx, this.ball.vy) * 0.9);
      this.ball.vx = (nx * 0.6 + towardNet * 0.4) * sp;
      this.ball.vy = Math.min(-300, ny * sp);
      this.sfx.beep(520, 0.04, 'triangle', 0.04);
    }
    this.lastTouch = side;
  }

  protected update(dt: number) {
    const i = this.input;
    const left = i.left || (i.pointer.down && i.pointer.x < this.me.x - 10);
    const right = i.right || (i.pointer.down && i.pointer.x > this.me.x + 10 && i.pointer.x < W / 2);
    const jump = i.anyHit('ArrowUp', 'KeyW', 'Space') || i.taps.length > 0;
    this.movePlayer(this.me, (right ? 1 : 0) - (left ? 1 : 0), jump, 30, NET.x - 30, dt);
    // CPU tracks the predicted landing spot on its side.
    const target = this.ball.x > NET.x || this.ball.vx > 0 ? this.ball.x + 18 : 480;
    const cpuDir = Math.abs(target - this.cpu.x) < 8 ? 0 : Math.sign(target - this.cpu.x);
    const cpuJump = this.ball.x > NET.x && Math.abs(this.ball.x - this.cpu.x) < 50 && this.ball.y > 120 && this.ball.y < 260 && this.ball.vy > 0;
    this.movePlayer(this.cpu, cpuDir * 0.85, cpuJump, NET.x + 30, W - 30, dt);
    if (this.serveTimer > 0) {
      this.serveTimer -= dt;
      return;
    }
    const b = this.ball;
    b.vy += GRAVITY * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x < 12 || b.x > W - 12) {
      b.vx *= -0.8;
      b.x = clamp(b.x, 12, W - 12);
    }
    // Net
    if (Math.abs(b.x - NET.x) < 16 && b.y > NET.top) {
      b.vx *= -0.6;
      b.x = NET.x + Math.sign(b.x - NET.x || 1) * 16;
    }
    this.touch(this.me, 0);
    this.touch(this.cpu, 1);
    if (b.y >= GROUND) {
      const winner = b.x < NET.x ? 1 : 0;
      this.scores[winner]!++;
      this.message = winner === 0 ? 'Point!' : 'CPU point';
      this.sfx[winner === 0 ? 'good' : 'bad']();
      const [a, c] = this.scores as [number, number];
      if ((a >= TARGET || c >= TARGET) && Math.abs(a - c) >= 2) {
        const won = a > c;
        this.setScore(won ? 200 + (a - c) * 40 : a * 10);
        if (won) this.sfx.win();
        this.end(won ? 'won' : 'lost', { for: a, against: c });
        return;
      }
      this.serve(winner);
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, p: Player, color: string) {
    this.roundRect(ctx, p.x - 16, p.y - 44, 32, 44, 10, color);
    this.circle(ctx, p.x, p.y - 56, 14, '#fde68a');
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(NET.x - 3, NET.top, 6, GROUND - NET.top);
    ctx.fillStyle = 'rgba(248,250,252,0.5)';
    ctx.fillRect(NET.x - 14, NET.top, 28, 6);
    this.drawPlayer(ctx, this.me, '#7c3aed');
    this.drawPlayer(ctx, this.cpu, '#dc2626');
    this.circle(ctx, this.ball.x, this.ball.y, 12, '#f8fafc');
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.ball.x, this.ball.y, 12, 0, Math.PI);
    ctx.stroke();
    this.text(ctx, `${this.scores[0]} : ${this.scores[1]}`, W / 2, 40, { size: 30, align: 'center', color: '#0f172a' });
    this.text(ctx, this.message, W / 2, 70, { size: 14, align: 'center', color: '#0f172a', font: 'body' });
    if (this.time < 4) this.text(ctx, '← → move · ↑ / Space / tap to jump · jump at the net to spike', W / 2, H - 14, { size: 12, align: 'center', color: '#0f172a', font: 'body' });
  }
}

export default defineGame(
  { key: 'volley-rally', engine: 'CANVAS', aspectRatio: W / H, orientation: 'landscape', maxScore: 200 + 20 * 40, controls: [{ action: 'Move', keys: '← → / hold left side' }, { action: 'Jump / spike', keys: '↑ / Space / tap' }] },
  (host) => new VolleyRally(host),
);
