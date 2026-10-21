import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';
import { applyFriction, bounceOffSegment, collideBodies, speed, type Body, type Segment } from '../../kit/physics';
import { clamp } from '../../kit/util';

const W = 720;
const H = 420;
const T = { x: 60, y: 50, w: 600, h: 320 };
const R = 9;
const POCKET_R = 18;
const COLORS = ['#f8fafc', '#facc15', '#2563eb', '#dc2626', '#7c3aed', '#f97316', '#16a34a', '#7f1d1d', '#111827'];

interface Ball extends Body {
  n: number; // 0 = cue, 1–7 solids, 8 = eight, 9–15 stripes
  sunk: boolean;
}
type Group = 'solids' | 'stripes' | null;

const groupOf = (n: number): Group => (n >= 1 && n <= 7 ? 'solids' : n >= 9 ? 'stripes' : null);

class Pool extends CanvasGame {
  private mode: 'menu' | 'cpu' | '2p' = 'menu';
  private balls: Ball[] = [];
  private turn = 0; // 0 = player 1 (you), 1 = player 2 / CPU
  private groups: [Group, Group] = [null, null];
  private shooting = false;
  private firstContact: number | null = null;
  private pottedThisShot: number[] = [];
  private aim = 0;
  private drag: { x: number; y: number } | null = null;
  private charge = 0;
  private message = '';
  private cpuDelay = 0;
  private ballInHand = false;
  private readonly cpuBtn = { x: W / 2 - 170, y: 230, w: 160, h: 50 };
  private readonly duoBtn = { x: W / 2 + 10, y: 230, w: 160, h: 50 };

  constructor(host: GameHost) {
    super(host, { width: W, height: H, background: '#3b2412' });
  }

  protected reset() {
    this.mode = 'menu';
    this.turn = 0;
    this.groups = [null, null];
    this.rack();
    this.message = 'Break! Drag back from the cue ball and release.';
  }

  private rack() {
    this.balls = [{ n: 0, x: T.x + T.w * 0.25, y: T.y + T.h / 2, vx: 0, vy: 0, r: R, sunk: false }];
    const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
    let k = 0;
    for (let col = 0; col < 5; col++)
      for (let row = 0; row <= col; row++) {
        this.balls.push({ n: order[k++]!, x: T.x + T.w * 0.7 + col * R * 1.8, y: T.y + T.h / 2 + (row - col / 2) * R * 2.05, vx: 0, vy: 0, r: R, sunk: false });
      }
  }

  private get cue() {
    return this.balls[0]!;
  }

  private pockets() {
    const { x, y, w, h } = T;
    return [[x, y], [x + w / 2, y - 4], [x + w, y], [x, y + h], [x + w / 2, y + h + 4], [x + w, y + h]] as [number, number][];
  }

  private cushions(): Segment[] {
    const { x, y, w, h } = T;
    const g = POCKET_R + 4;
    return [
      { x1: x + g, y1: y, x2: x + w / 2 - g, y2: y },
      { x1: x + w / 2 + g, y1: y, x2: x + w - g, y2: y },
      { x1: x + g, y1: y + h, x2: x + w / 2 - g, y2: y + h },
      { x1: x + w / 2 + g, y1: y + h, x2: x + w - g, y2: y + h },
      { x1: x, y1: y + g, x2: x, y2: y + h - g },
      { x1: x + w, y1: y + g, x2: x + w, y2: y + h - g },
    ];
  }

  private shoot(angle: number, power: number) {
    const v = clamp(power, 0.05, 1) * 1100;
    this.cue.vx = Math.cos(angle) * v;
    this.cue.vy = Math.sin(angle) * v;
    this.shooting = true;
    this.firstContact = null;
    this.pottedThisShot = [];
    this.ballInHand = false;
    this.sfx.beep(240, 0.05, 'square', 0.05);
  }

  private remaining(group: Group) {
    return this.balls.filter((b) => !b.sunk && groupOf(b.n) === group).length;
  }

  private endShot() {
    this.shooting = false;
    const me = this.turn;
    const mine = this.groups[me] ?? null;
    const scratch = this.cue.sunk;
    const potted = this.pottedThisShot;
    // Eight ball decides the game.
    if (potted.includes(8)) {
      const legal = !scratch && mine !== null && this.remaining(mine) === 0;
      return this.gameOver(legal ? me : 1 - me, legal ? 'sank the 8-ball' : 'pocketed the 8-ball too early');
    }
    // Assign groups on the first legal pot after the break.
    if (!mine) {
      const first = potted.find((n) => groupOf(n));
      if (first !== undefined && !scratch) {
        this.groups[me] = groupOf(first);
        this.groups[1 - me] = groupOf(first) === 'solids' ? 'stripes' : 'solids';
      }
    }
    const group = this.groups[me] ?? null;
    const wrongFirst = group !== null && this.firstContact !== null && groupOf(this.firstContact) !== group && !(this.firstContact === 8 && this.remaining(group) === 0);
    const foul = scratch || this.firstContact === null || wrongFirst;
    const ownPot = potted.some((n) => (group ? groupOf(n) === group : groupOf(n) !== null));
    if (scratch) {
      this.cue.sunk = false;
      this.cue.x = T.x + T.w * 0.25;
      this.cue.y = T.y + T.h / 2;
      this.cue.vx = this.cue.vy = 0;
    }
    if (foul) {
      this.turn = 1 - me;
      this.ballInHand = true;
      this.message = `Foul (${scratch ? 'scratch' : this.firstContact === null ? 'no ball hit' : 'wrong ball first'}). ${this.name(this.turn)} has ball in hand.`;
    } else if (ownPot) {
      this.message = `${this.name(me)} potted — shoot again.`;
      if (me === 0) this.addScore(potted.filter((n) => groupOf(n)).length * 50);
    } else {
      this.turn = 1 - me;
      this.message = `${this.name(this.turn)} to shoot.`;
    }
    if (this.mode === 'cpu' && this.turn === 1) this.cpuDelay = 0.9;
  }

  private name(p: number) {
    return this.mode === 'cpu' ? (p === 0 ? 'You' : 'Computer') : `Player ${p + 1}`;
  }

  private gameOver(winner: number, how: string) {
    if (this.mode === 'cpu') {
      const won = winner === 0;
      this.setScore(won ? 500 + this.score : this.score);
      this.message = won ? `You win — the 8-ball game is yours! 🎱` : `The computer wins (${how}).`;
      if (won) this.sfx.win();
      this.end(won ? 'won' : 'lost');
    } else {
      this.message = `Player ${winner + 1} wins!`;
      this.end('completed');
    }
  }

  /** CPU: pick an own-group ball and pocket with the easiest cut, aim at the ghost-ball point. */
  private cpuShot() {
    const group = this.groups[1];
    const targets = this.balls.filter((b) => !b.sunk && b.n !== 0 && (group ? groupOf(b.n) === group || (b.n === 8 && this.remaining(group) === 0) : b.n !== 8));
    let best: { angle: number; power: number; cost: number } | null = null;
    for (const t of targets)
      for (const [px, py] of this.pockets()) {
        const toPocket = Math.atan2(py - t.y, px - t.x);
        const gx = t.x - Math.cos(toPocket) * R * 2;
        const gy = t.y - Math.sin(toPocket) * R * 2;
        const shotAngle = Math.atan2(gy - this.cue.y, gx - this.cue.x);
        const cut = Math.abs(Math.atan2(Math.sin(shotAngle - toPocket), Math.cos(shotAngle - toPocket)));
        if (cut > 1.2) continue;
        const d = Math.hypot(gx - this.cue.x, gy - this.cue.y) + Math.hypot(px - t.x, py - t.y);
        const cost = cut * 300 + d;
        if (!best || cost < best.cost) best = { angle: shotAngle, power: clamp(d / 900, 0.35, 0.9), cost };
      }
    const error = (this.random() - 0.5) * 0.06;
    if (best) this.shoot(best.angle + error, best.power);
    else this.shoot(this.random() * Math.PI * 2, 0.6);
  }

  protected update(dt: number) {
    const i = this.input;
    if (this.mode === 'menu') {
      if (this.tapped(this.cpuBtn) || i.hit('Digit1')) this.mode = 'cpu';
      else if (this.tapped(this.duoBtn) || i.hit('Digit2')) this.mode = '2p';
      return;
    }
    if (this.shooting) {
      const steps = 6;
      for (let s = 0; s < steps; s++) {
        const live = this.balls.filter((b) => !b.sunk);
        for (const b of live) {
          b.x += (b.vx * dt) / steps;
          b.y += (b.vy * dt) / steps;
          for (const c of this.cushions()) bounceOffSegment(b, c, 0.8);
        }
        for (let a = 0; a < live.length; a++)
          for (let c = a + 1; c < live.length; c++) {
            const A = live[a]!;
            const C = live[c]!;
            if (collideBodies(A, C, 0.95)) {
              if (this.firstContact === null && (A.n === 0 || C.n === 0)) this.firstContact = A.n === 0 ? C.n : A.n;
            }
          }
        for (const b of live)
          for (const [px, py] of this.pockets())
            if (Math.hypot(b.x - px, b.y - py) < POCKET_R) {
              b.sunk = true;
              b.vx = b.vy = 0;
              this.pottedThisShot.push(b.n);
              this.sfx.beep(180, 0.08, 'triangle');
            }
      }
      for (const b of this.balls) applyFriction(b, 0.45, dt, 5);
      if (this.balls.every((b) => b.sunk || speed(b) === 0)) this.endShot();
      return;
    }
    if (this.mode === 'cpu' && this.turn === 1) {
      this.cpuDelay -= dt;
      if (this.cpuDelay <= 0) this.cpuShot();
      return;
    }
    // Human turn: optionally place the cue ball (ball in hand), then aim & shoot.
    if (this.ballInHand && i.taps.length) {
      const t = i.taps[0]!;
      const inside = t.x > T.x + R && t.x < T.x + T.w - R && t.y > T.y + R && t.y < T.y + T.h - R;
      const clear = this.balls.every((b) => b.n === 0 || b.sunk || Math.hypot(b.x - t.x, b.y - t.y) > R * 2.2);
      if (inside && clear && Math.hypot(t.x - this.cue.x, t.y - this.cue.y) > 30) {
        this.cue.x = t.x;
        this.cue.y = t.y;
        return;
      }
    }
    if (i.pointer.down) this.aim = Math.atan2(i.pointer.y - this.cue.y, i.pointer.x - this.cue.x);
    if (i.left) this.aim -= 1.5 * dt;
    if (i.right) this.aim += 1.5 * dt;
    if (i.taps.length && Math.hypot(i.taps[0]!.x - this.cue.x, i.taps[0]!.y - this.cue.y) < 60) this.drag = { ...i.taps[0]! };
    const rel = i.releases[0];
    if (this.drag && rel) {
      const pull = Math.hypot(rel.x - this.drag.x, rel.y - this.drag.y);
      if (pull > 10) this.shoot(Math.atan2(this.drag.y - rel.y, this.drag.x - rel.x), pull / 200);
      this.drag = null;
    }
    if (i.key('Space')) this.charge = Math.min(1, this.charge + dt * 0.8);
    else if (this.charge > 0) {
      this.shoot(this.aim, this.charge);
      this.charge = 0;
    }
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    this.roundRect(ctx, T.x - 26, T.y - 26, T.w + 52, T.h + 52, 18, '#78350f');
    ctx.fillStyle = '#166534';
    ctx.fillRect(T.x, T.y, T.w, T.h);
    for (const [px, py] of this.pockets()) this.circle(ctx, px, py, POCKET_R, '#020617');
    if (this.mode === 'menu') {
      this.text(ctx, '8-BALL POOL', W / 2, 190, { size: 34, align: 'center', color: '#fde68a' });
      this.button(ctx, this.cpuBtn, '1 · vs CPU', true);
      this.button(ctx, this.duoBtn, '2 · 2 Players');
      return;
    }
    for (const b of this.balls) {
      if (b.sunk) continue;
      const base = b.n === 0 ? COLORS[0]! : COLORS[((b.n - 1) % 8) + 1]!;
      this.circle(ctx, b.x, b.y, R, b.n >= 9 ? '#f8fafc' : base);
      if (b.n >= 9) {
        ctx.fillStyle = base;
        ctx.fillRect(b.x - R, b.y - R * 0.45, R * 2, R * 0.9);
      }
      if (b.n > 0) this.text(ctx, String(b.n), b.x, b.y + 3.5, { size: 8, align: 'center', color: '#0f172a', weight: 800, font: 'body' });
    }
    const humanTurn = !(this.mode === 'cpu' && this.turn === 1);
    if (!this.shooting && humanTurn) {
      let ang = this.aim;
      let power = this.charge;
      if (this.drag && this.input.pointer.down) {
        ang = Math.atan2(this.drag.y - this.input.pointer.y, this.drag.x - this.input.pointer.x);
        power = clamp(Math.hypot(this.input.pointer.x - this.drag.x, this.input.pointer.y - this.drag.y) / 200, 0, 1);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(this.cue.x, this.cue.y);
      ctx.lineTo(this.cue.x + Math.cos(ang) * 260, this.cue.y + Math.sin(ang) * 260);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#d6a96b';
      ctx.lineWidth = 5;
      const back = 16 + power * 60;
      ctx.beginPath();
      ctx.moveTo(this.cue.x - Math.cos(ang) * back, this.cue.y - Math.sin(ang) * back);
      ctx.lineTo(this.cue.x - Math.cos(ang) * (back + 160), this.cue.y - Math.sin(ang) * (back + 160));
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    const g = (p: number) => (this.groups[p] ? this.groups[p] : 'open');
    this.text(ctx, `${this.name(0)}: ${g(0)}${this.turn === 0 ? ' ◀' : ''}`, 16, 26, { size: 14, font: 'body' });
    this.text(ctx, `${this.turn === 1 ? '▶ ' : ''}${this.name(1)}: ${g(1)}`, W - 16, 26, { size: 14, align: 'right', font: 'body' });
    this.text(ctx, this.ballInHand && humanTurn ? 'Ball in hand: tap the table to place the cue ball, then shoot.' : this.message, W / 2, H - 10, { size: 13, align: 'center', color: '#fde68a', font: 'body' });
  }
}

export default defineGame(
  { key: 'pool-8-ball', engine: 'CANVAS', aspectRatio: W / H, orientation: 'landscape', maxScore: 500 + 7 * 50 * 2, controls: [{ action: 'Shoot', keys: 'Drag back from the cue ball & release' }, { action: 'Keyboard', keys: '← → aim · hold Space for power' }] },
  (host) => new Pool(host),
);
