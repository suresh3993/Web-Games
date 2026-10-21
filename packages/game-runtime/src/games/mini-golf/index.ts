import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';
import { applyFriction, bounceOffSegment, rectWalls, speed, type Body, type Segment } from '../../kit/physics';
import { clamp } from '../../kit/util';

const W = 480;
const H = 640;
const MAX_STROKES = 8;

type Pt = [number, number];
interface Hole {
  outline: Pt[];
  walls?: [number, number, number, number][];
  blocks?: [number, number, number, number][];
  mover?: { x: number; y: number; w: number; h: number; range: number; speed: number };
  spinner?: { x: number; y: number; len: number; speed: number };
  start: Pt;
  cup: Pt;
  par: number;
}

const rect = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

/** Nine original holes. */
const HOLES: Hole[] = [
  { outline: rect(140, 60, 200, 520), start: [240, 520], cup: [240, 120], par: 2 },
  { outline: [[80, 60], [400, 60], [400, 200], [200, 200], [200, 580], [80, 580]], start: [140, 530], cup: [350, 120], par: 3 },
  { outline: rect(100, 60, 280, 520), blocks: [[190, 280, 100, 60]], start: [240, 540], cup: [240, 110], par: 2 },
  { outline: rect(60, 60, 360, 520), walls: [[60, 230, 320, 230], [160, 410, 420, 410]], start: [380, 540], cup: [100, 110], par: 3 },
  { outline: rect(120, 60, 240, 520), mover: { x: 180, y: 300, w: 120, h: 24, range: 60, speed: 1.6 }, start: [240, 540], cup: [240, 110], par: 2 },
  { outline: rect(80, 60, 320, 520), blocks: [[150, 230, 40, 40], [290, 230, 40, 40], [220, 360, 40, 40]], start: [240, 540], cup: [240, 110], par: 3 },
  { outline: [[200, 60], [280, 60], [280, 300], [420, 300], [420, 580], [60, 580], [60, 300], [200, 300]], start: [100, 540], cup: [240, 100], par: 3 },
  { outline: rect(100, 60, 280, 520), spinner: { x: 240, y: 330, len: 90, speed: 1.4 }, start: [240, 540], cup: [240, 110], par: 3 },
  { outline: [[60, 60], [420, 60], [420, 580], [300, 580], [300, 200], [180, 200], [180, 580], [60, 580]], start: [120, 540], cup: [360, 540], par: 4 },
];

class MiniGolf extends CanvasGame {
  private holeNo = 0;
  private ball: Body = { x: 0, y: 0, vx: 0, vy: 0, r: 8 };
  private strokes = 0;
  private card: number[] = [];
  private drag: { x: number; y: number } | null = null;
  private aim = -Math.PI / 2;
  private charge = 0;
  private sinkT = 0;

  constructor(host: GameHost) {
    super(host, { width: W, height: H, background: '#0b3d1f' });
  }

  protected reset() {
    this.holeNo = 0;
    this.card = [];
    this.loadHole();
  }

  private get hole() {
    return HOLES[this.holeNo]!;
  }

  private loadHole() {
    const [x, y] = this.hole.start;
    this.ball = { x, y, vx: 0, vy: 0, r: 8 };
    this.strokes = 0;
    this.drag = null;
    this.charge = 0;
    this.sinkT = 0;
  }

  private walls(): Segment[] {
    const h = this.hole;
    const segs: Segment[] = h.outline.map((p, i) => {
      const q = h.outline[(i + 1) % h.outline.length]!;
      return { x1: p[0], y1: p[1], x2: q[0], y2: q[1] };
    });
    for (const [x1, y1, x2, y2] of h.walls ?? []) segs.push({ x1, y1, x2, y2 });
    for (const [x, y, w, hh] of h.blocks ?? []) segs.push(...rectWalls(x, y, w, hh));
    if (h.mover) segs.push(...rectWalls(h.mover.x + Math.sin(this.time * h.mover.speed) * h.mover.range, h.mover.y, h.mover.w, h.mover.h));
    if (h.spinner) {
      const a = this.time * h.spinner.speed;
      const dx = Math.cos(a) * h.spinner.len;
      const dy = Math.sin(a) * h.spinner.len;
      segs.push({ x1: h.spinner.x - dx, y1: h.spinner.y - dy, x2: h.spinner.x + dx, y2: h.spinner.y + dy });
    }
    return segs;
  }

  private putt(power: number, angle: number) {
    const v = clamp(power, 0, 1) * 900;
    this.ball.vx = Math.cos(angle) * v;
    this.ball.vy = Math.sin(angle) * v;
    this.strokes++;
    this.sfx.click();
  }

  private finishHole() {
    const strokes = this.strokes;
    this.card.push(strokes);
    const pts = Math.max(0, this.hole.par + 3 - strokes) * 100 + (strokes === 1 ? 200 : 0);
    this.addScore(pts);
    if (strokes === 1) this.sfx.win();
    else this.sfx.good();
    if (this.holeNo >= HOLES.length - 1) {
      const total = this.card.reduce((a, b) => a + b, 0);
      const par = HOLES.reduce((a, h) => a + h.par, 0);
      this.end('completed', { strokes: total, par });
      return;
    }
    this.holeNo++;
    this.loadHole();
  }

  protected update(dt: number) {
    const i = this.input;
    if (this.sinkT > 0) {
      this.sinkT -= dt;
      if (this.sinkT <= 0) this.finishHole();
      return;
    }
    const moving = speed(this.ball) > 0;
    if (!moving) {
      if (i.taps.length) this.drag = { ...i.taps[0]! };
      const rel = i.releases[0];
      if (this.drag && rel) {
        const dx = this.drag.x - rel.x;
        const dy = this.drag.y - rel.y;
        const len = Math.hypot(dx, dy);
        if (len > 8) this.putt(len / 220, Math.atan2(dy, dx));
        this.drag = null;
      }
      if (i.left) this.aim -= 2 * dt;
      if (i.right) this.aim += 2 * dt;
      if (i.key('Space')) this.charge = Math.min(1, this.charge + dt * 0.9);
      else if (this.charge > 0) {
        this.putt(this.charge, this.aim);
        this.charge = 0;
      }
    }
    const steps = 4;
    const segs = this.walls();
    for (let s = 0; s < steps; s++) {
      this.ball.x += (this.ball.vx * dt) / steps;
      this.ball.y += (this.ball.vy * dt) / steps;
      for (const seg of segs) if (bounceOffSegment(this.ball, seg, 0.8)) this.sfx.beep(260, 0.02, 'triangle', 0.02);
    }
    applyFriction(this.ball, 0.35, dt, 6);
    const [cx, cy] = this.hole.cup;
    const d = Math.hypot(this.ball.x - cx, this.ball.y - cy);
    if (d < 11 && speed(this.ball) < 520) {
      this.ball.vx = this.ball.vy = 0;
      this.ball.x = cx;
      this.ball.y = cy;
      this.sinkT = 0.6;
    } else if (!moving && speed(this.ball) === 0 && this.strokes >= MAX_STROKES) {
      this.strokes = MAX_STROKES + 1;
      this.finishHole();
    }
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    const h = this.hole;
    ctx.fillStyle = '#16a34a';
    ctx.beginPath();
    h.outline.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#a16207';
    ctx.lineWidth = 6;
    for (const s of this.walls()) {
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
    }
    const [cx, cy] = h.cup;
    this.circle(ctx, cx, cy, 11, '#0f172a');
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(cx, cy - 46, 2, 46);
    ctx.beginPath();
    ctx.moveTo(cx + 2, cy - 46);
    ctx.lineTo(cx + 22, cy - 39);
    ctx.lineTo(cx + 2, cy - 32);
    ctx.fill();
    if (this.sinkT <= 0) this.circle(ctx, this.ball.x, this.ball.y, this.ball.r, '#f8fafc');
    const still = speed(this.ball) === 0 && this.sinkT <= 0;
    if (still) {
      let ang = this.aim;
      let power = this.charge;
      if (this.drag && this.input.pointer.down) {
        const dx = this.drag.x - this.input.pointer.x;
        const dy = this.drag.y - this.input.pointer.y;
        ang = Math.atan2(dy, dx);
        power = clamp(Math.hypot(dx, dy) / 220, 0, 1);
      }
      ctx.strokeStyle = 'rgba(248,250,252,0.7)';
      ctx.setLineDash([5, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.ball.x, this.ball.y);
      ctx.lineTo(this.ball.x + Math.cos(ang) * (40 + power * 120), this.ball.y + Math.sin(ang) * (40 + power * 120));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const total = this.card.reduce((a, b) => a + b, 0);
    this.hud(ctx, `Hole ${this.holeNo + 1}/9 · Par ${h.par} · Strokes ${this.strokes}`, `Total ${total + this.strokes}`);
    if (this.time < 4) this.text(ctx, 'Drag back from the ball and release (or ←→ + hold Space)', W / 2, H - 16, { size: 12, align: 'center', color: '#dcfce7', font: 'body' });
  }
}

export default defineGame(
  { key: 'mini-golf', engine: 'CANVAS', aspectRatio: W / H, orientation: 'portrait', maxScore: 9 * 700, controls: [{ action: 'Putt', keys: 'Drag back & release / ← → + hold Space' }] },
  (host) => new MiniGolf(host),
);
