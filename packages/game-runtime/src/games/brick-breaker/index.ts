import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';
import { circleRect, clamp } from '../../kit/util';

interface Brick {
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  color: string;
}
interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  stuck: boolean;
}
interface PowerUp {
  x: number;
  y: number;
  kind: 'wide' | 'multi' | 'life';
}

const W = 480;
const H = 640;
const BALL_R = 6;
const ROW_COLORS = ['#f43f5e', '#f97316', '#facc15', '#4ade80', '#22d3ee', '#818cf8', '#c084fc'];

class BrickBreaker extends CanvasGame {
  private paddle = { x: W / 2, w: 90 };
  private balls: Ball[] = [];
  private bricks: Brick[] = [];
  private powerUps: PowerUp[] = [];
  private lives = 3;
  private level = 1;
  private wideTimer = 0;

  constructor(host: GameHost) {
    super(host, { width: W, height: H });
  }

  protected reset() {
    this.lives = 3;
    this.level = 1;
    this.buildLevel();
  }

  private buildLevel() {
    this.bricks = [];
    this.powerUps = [];
    const rows = Math.min(7, 4 + this.level);
    const cols = 10;
    const bw = (W - 40) / cols;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        // Later levels carve patterns and add armoured bricks.
        if (this.level > 1 && (r + c * this.level) % 7 === 0) continue;
        const armoured = this.level > 1 && r < this.level - 1;
        this.bricks.push({ x: 20 + c * bw + 2, y: 70 + r * 24, w: bw - 4, h: 18, hp: armoured ? 2 : 1, color: ROW_COLORS[r % ROW_COLORS.length]! });
      }
    this.paddle = { x: W / 2, w: 90 };
    this.wideTimer = 0;
    this.serve();
  }

  private serve() {
    this.balls = [{ x: this.paddle.x, y: H - 50 - BALL_R, vx: 0, vy: 0, stuck: true }];
  }

  private speed() {
    return 330 + this.level * 30;
  }

  protected update(dt: number) {
    const i = this.input;
    // Paddle: pointer/touch follows; keyboard moves.
    if (i.pointer.down || i.taps.length) this.paddle.x = i.pointer.x;
    else if (i.left) this.paddle.x -= 520 * dt;
    else if (i.right) this.paddle.x += 520 * dt;
    this.paddle.x = clamp(this.paddle.x, this.paddle.w / 2, W - this.paddle.w / 2);
    this.wideTimer = Math.max(0, this.wideTimer - dt);
    this.paddle.w = this.wideTimer > 0 ? 140 : 90;

    const launch = i.anyHit('Space', 'ArrowUp', 'Enter') || i.releases.length > 0;
    for (const ball of this.balls) {
      if (ball.stuck) {
        ball.x = this.paddle.x;
        if (launch) {
          const angle = -Math.PI / 2 + (this.random() - 0.5) * 0.6;
          ball.vx = Math.cos(angle) * this.speed();
          ball.vy = Math.sin(angle) * this.speed();
          ball.stuck = false;
        }
        continue;
      }
      this.moveBall(ball, dt);
    }
    this.balls = this.balls.filter((b) => b.y < H + 20);
    if (!this.balls.length) {
      this.lives--;
      this.sfx.bad();
      if (this.lives <= 0) {
        this.end('lost', { level: this.level });
        return;
      }
      this.serve();
    }

    for (const p of this.powerUps) p.y += 160 * dt;
    const paddleRect = { x: this.paddle.x - this.paddle.w / 2, y: H - 50, w: this.paddle.w, h: 12 };
    this.powerUps = this.powerUps.filter((p) => {
      if (circleRect(p.x, p.y, 10, paddleRect)) {
        this.sfx.good();
        if (p.kind === 'wide') this.wideTimer = 12;
        if (p.kind === 'life') this.lives = Math.min(5, this.lives + 1);
        if (p.kind === 'multi') {
          const src = this.balls.find((b) => !b.stuck);
          if (src) for (const a of [-0.4, 0.4]) {
            const sp = Math.hypot(src.vx, src.vy);
            const ang = Math.atan2(src.vy, src.vx) + a;
            this.balls.push({ x: src.x, y: src.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, stuck: false });
          }
        }
        return false;
      }
      return p.y < H + 20;
    });

    if (!this.bricks.some((b) => b.hp > 0)) {
      this.addScore(500 * this.level);
      this.level++;
      this.sfx.win();
      if (this.level > 8) {
        this.end('won', { level: 8 });
        return;
      }
      this.buildLevel();
    }
  }

  private moveBall(ball: Ball, dt: number) {
    const steps = 3;
    for (let s = 0; s < steps; s++) {
      ball.x += (ball.vx * dt) / steps;
      ball.y += (ball.vy * dt) / steps;
      if (ball.x < BALL_R || ball.x > W - BALL_R) {
        ball.vx *= -1;
        ball.x = clamp(ball.x, BALL_R, W - BALL_R);
      }
      if (ball.y < BALL_R + 40) {
        ball.vy = Math.abs(ball.vy);
      }
      const paddleRect = { x: this.paddle.x - this.paddle.w / 2, y: H - 50, w: this.paddle.w, h: 12 };
      if (ball.vy > 0 && circleRect(ball.x, ball.y, BALL_R, paddleRect)) {
        // Angle depends on where the ball hits the paddle.
        const offset = (ball.x - this.paddle.x) / (this.paddle.w / 2);
        const angle = -Math.PI / 2 + clamp(offset, -1, 1) * 1.05;
        const sp = this.speed();
        ball.vx = Math.cos(angle) * sp;
        ball.vy = Math.sin(angle) * sp;
        this.sfx.click();
      }
      for (const b of this.bricks) {
        if (b.hp <= 0 || !circleRect(ball.x, ball.y, BALL_R, b)) continue;
        const overlapX = Math.min(ball.x + BALL_R - b.x, b.x + b.w - (ball.x - BALL_R));
        const overlapY = Math.min(ball.y + BALL_R - b.y, b.y + b.h - (ball.y - BALL_R));
        if (overlapX < overlapY) ball.vx *= -1;
        else ball.vy *= -1;
        b.hp--;
        this.addScore(b.hp > 0 ? 5 : 10 * this.level);
        this.sfx.beep(520 + b.y, 0.04, 'square', 0.04);
        if (b.hp <= 0 && this.random() < 0.12) {
          const roll = this.random();
          this.powerUps.push({ x: b.x + b.w / 2, y: b.y, kind: roll < 0.45 ? 'wide' : roll < 0.85 ? 'multi' : 'life' });
        }
        break;
      }
    }
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    this.hud(ctx, `Score ${this.score}`, `Level ${this.level}  ·  ${'♥'.repeat(Math.max(0, this.lives))}`);
    for (const b of this.bricks) {
      if (b.hp <= 0) continue;
      this.roundRect(ctx, b.x, b.y, b.w, b.h, 4, b.hp > 1 ? '#94a3b8' : b.color);
      if (b.hp > 1) {
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
      }
    }
    for (const p of this.powerUps) {
      const color = p.kind === 'wide' ? '#22d3ee' : p.kind === 'multi' ? '#facc15' : '#f472b6';
      this.circle(ctx, p.x, p.y, 10, color);
      this.text(ctx, p.kind === 'wide' ? 'W' : p.kind === 'multi' ? 'M' : '♥', p.x, p.y + 4, { size: 11, color: '#0b1022', align: 'center' });
    }
    this.glow(ctx, '#a78bfa', 14);
    this.roundRect(ctx, this.paddle.x - this.paddle.w / 2, H - 50, this.paddle.w, 12, 6, '#a78bfa');
    this.glow(ctx, '#e0f2fe', 12);
    for (const b of this.balls) this.circle(ctx, b.x, b.y, BALL_R, '#f8fafc');
    this.noGlow(ctx);
    if (this.balls.some((b) => b.stuck) && !this.finished) {
      this.text(ctx, 'Press Space or tap to launch', W / 2, H / 2 + 60, { size: 16, color: '#9aa0c0', align: 'center', font: 'body' });
    }
  }
}

export default defineGame(
  {
    key: 'brick-breaker',
    engine: 'CANVAS',
    aspectRatio: W / H,
    orientation: 'portrait',
    maxScore: 400_000,
    controls: [
      { action: 'Move paddle', keys: 'Mouse / drag / ← →' },
      { action: 'Launch ball', keys: 'Space / tap' },
    ],
  },
  (host) => new BrickBreaker(host),
);
