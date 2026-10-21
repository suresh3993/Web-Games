import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';
import { applyFriction, bounceOffSegment, collideBodies, type Body, type Segment } from '../../kit/physics';
import { clamp } from '../../kit/util';

const W = 360;
const H = 600;
const GOAL_W = 120;
const TARGET = 7;

class AirHockey extends CanvasGame {
  private mode: 'menu' | 'cpu' | '2p' = 'menu';
  private puck: Body = { x: W / 2, y: H / 2, vx: 0, vy: 0, r: 14, m: 1 };
  private p1: Body = { x: W / 2, y: H - 80, vx: 0, vy: 0, r: 26, m: Infinity };
  private p2: Body = { x: W / 2, y: 80, vx: 0, vy: 0, r: 26, m: Infinity };
  private scores = [0, 0];
  private servePause = 0;
  private readonly cpuBtn = { x: 70, y: 260, w: 220, h: 50 };
  private readonly duoBtn = { x: 70, y: 330, w: 220, h: 50 };

  constructor(host: GameHost) {
    super(host, { width: W, height: H, background: '#0b2545' });
  }

  protected reset() {
    this.mode = 'menu';
    this.scores = [0, 0];
    this.serve(1);
  }

  private serve(toward: number) {
    this.puck = { x: W / 2, y: H / 2 + toward * 60, vx: 0, vy: 0, r: 14, m: 1 };
    this.p1 = { ...this.p1, x: W / 2, y: H - 80, vx: 0, vy: 0 };
    this.p2 = { ...this.p2, x: W / 2, y: 80, vx: 0, vy: 0 };
    this.servePause = 0.6;
  }

  private walls(): Segment[] {
    const gl = (W - GOAL_W) / 2;
    const gr = gl + GOAL_W;
    return [
      { x1: 0, y1: 0, x2: 0, y2: H },
      { x1: W, y1: 0, x2: W, y2: H },
      { x1: 0, y1: 0, x2: gl, y2: 0 },
      { x1: gr, y1: 0, x2: W, y2: 0 },
      { x1: 0, y1: H, x2: gl, y2: H },
      { x1: gr, y1: H, x2: W, y2: H },
    ];
  }

  private moveMallet(m: Body, tx: number, ty: number, minY: number, maxY: number, maxSpeed: number, dt: number) {
    const nx = clamp(tx, m.r, W - m.r);
    const ny = clamp(ty, minY + m.r, maxY - m.r);
    const dx = clamp(nx - m.x, -maxSpeed * dt, maxSpeed * dt);
    const dy = clamp(ny - m.y, -maxSpeed * dt, maxSpeed * dt);
    m.vx = dx / dt;
    m.vy = dy / dt;
    m.x += dx;
    m.y += dy;
  }

  protected update(dt: number) {
    const i = this.input;
    if (this.mode === 'menu') {
      if (this.tapped(this.cpuBtn) || i.hit('Digit1')) this.mode = 'cpu';
      else if (this.tapped(this.duoBtn) || i.hit('Digit2')) this.mode = '2p';
      return;
    }
    // Player 1 (bottom): pointer in the bottom half, or WASD.
    let t1x = this.p1.x + ((i.key('KeyD') ? 1 : 0) - (i.key('KeyA') ? 1 : 0)) * 400 * dt;
    let t1y = this.p1.y + ((i.key('KeyS') ? 1 : 0) - (i.key('KeyW') ? 1 : 0)) * 400 * dt;
    if (i.pointer.down && (this.mode === 'cpu' || i.pointer.y > H / 2)) {
      t1x = i.pointer.x;
      t1y = i.pointer.y;
    }
    if (this.mode === 'cpu') {
      t1x += ((i.key('ArrowRight') ? 1 : 0) - (i.key('ArrowLeft') ? 1 : 0)) * 400 * dt;
      t1y += ((i.key('ArrowDown') ? 1 : 0) - (i.key('ArrowUp') ? 1 : 0)) * 400 * dt;
    }
    this.moveMallet(this.p1, t1x, t1y, H / 2, H, 1400, dt);
    if (this.mode === 'cpu') {
      // CPU: defend the goal line, attack when the puck is in its half.
      const attack = this.puck.y < H / 2 && this.puck.vy < 120;
      const tx = attack ? this.puck.x : clamp(this.puck.x, W / 2 - GOAL_W / 2, W / 2 + GOAL_W / 2);
      const ty = attack ? this.puck.y - 10 : 70;
      this.moveMallet(this.p2, tx, ty, 0, H / 2, 520 + (this.scores[0]! - this.scores[1]!) * 40, dt);
    } else {
      let tx = this.p2.x + ((i.key('ArrowRight') ? 1 : 0) - (i.key('ArrowLeft') ? 1 : 0)) * 400 * dt;
      let ty = this.p2.y + ((i.key('ArrowDown') ? 1 : 0) - (i.key('ArrowUp') ? 1 : 0)) * 400 * dt;
      if (i.pointer.down && i.pointer.y < H / 2) {
        tx = i.pointer.x;
        ty = i.pointer.y;
      }
      this.moveMallet(this.p2, tx, ty, 0, H / 2, 1400, dt);
    }
    if (this.servePause > 0) {
      this.servePause -= dt;
      return;
    }
    const steps = 4;
    for (let s = 0; s < steps; s++) {
      this.puck.x += (this.puck.vx * dt) / steps;
      this.puck.y += (this.puck.vy * dt) / steps;
      for (const w of this.walls()) bounceOffSegment(this.puck, w, 0.92);
      if (collideBodies(this.p1, this.puck, 0.9) || collideBodies(this.p2, this.puck, 0.9)) this.sfx.beep(520, 0.03, 'triangle', 0.04);
    }
    const sp = Math.hypot(this.puck.vx, this.puck.vy);
    if (sp > 1100) {
      this.puck.vx *= 1100 / sp;
      this.puck.vy *= 1100 / sp;
    }
    applyFriction(this.puck, 0.8, dt, 2);
    if (this.puck.y < -this.puck.r || this.puck.y > H + this.puck.r) {
      const scorer = this.puck.y > H ? 1 : 0;
      this.scores[scorer]!++;
      this.sfx[scorer === 0 || this.mode === '2p' ? 'good' : 'bad']();
      if (this.scores[scorer]! >= TARGET) {
        if (this.mode === 'cpu') {
          const won = scorer === 0;
          this.setScore(won ? 200 + (this.scores[0]! - this.scores[1]!) * 40 : this.scores[0]! * 10);
          this.end(won ? 'won' : 'lost');
        } else this.end('completed');
        return;
      }
      this.serve(scorer === 0 ? -1 : 1);
    }
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = 'rgba(147,197,253,0.4)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 50, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#f43f5e';
    ctx.fillRect((W - GOAL_W) / 2, 0, GOAL_W, 6);
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect((W - GOAL_W) / 2, H - 6, GOAL_W, 6);
    if (this.mode === 'menu') {
      this.text(ctx, 'AIR HOCKEY', W / 2, 200, { size: 34, align: 'center', color: '#a5f3fc' });
      this.button(ctx, this.cpuBtn, '1 · vs CPU', true);
      this.button(ctx, this.duoBtn, '2 · 2 Players');
      this.text(ctx, `First to ${TARGET} goals`, W / 2, 420, { size: 14, align: 'center', color: '#9aa0c0', font: 'body' });
      return;
    }
    this.glow(ctx, '#f43f5e', 14);
    this.circle(ctx, this.p2.x, this.p2.y, this.p2.r, '#f43f5e');
    this.glow(ctx, '#22d3ee', 14);
    this.circle(ctx, this.p1.x, this.p1.y, this.p1.r, '#22d3ee');
    this.glow(ctx, '#facc15', 14);
    this.circle(ctx, this.puck.x, this.puck.y, this.puck.r, '#facc15');
    this.noGlow(ctx);
    this.text(ctx, String(this.scores[1]), 20, H / 2 - 16, { size: 28, color: '#f43f5e' });
    this.text(ctx, String(this.scores[0]), 20, H / 2 + 40, { size: 28, color: '#22d3ee' });
  }
}

export default defineGame(
  { key: 'air-hockey', engine: 'CANVAS', aspectRatio: W / H, orientation: 'portrait', maxScore: 200 + TARGET * 40, controls: [{ action: 'Move mallet', keys: 'Pointer / WASD (P2: arrows)' }] },
  (host) => new AirHockey(host),
);
