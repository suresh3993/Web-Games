import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';
import { dist } from '../../kit/util';

const W = 640;
const H = 480;
const WAVES = 20;
const PATH: [number, number][] = [[-20, 80], [520, 80], [520, 200], [120, 200], [120, 330], [560, 330], [560, 420], [660, 420]];

const TOWERS = {
  pulse: { name: 'Pulse', cost: 50, range: 90, rate: 0.6, damage: 12, color: '#22d3ee', splash: 0, slow: 0 },
  laser: { name: 'Laser', cost: 80, range: 140, rate: 1.2, damage: 40, color: '#f43f5e', splash: 0, slow: 0 },
  frost: { name: 'Frost', cost: 70, range: 90, rate: 0.8, damage: 4, color: '#93c5fd', splash: 0, slow: 0.5 },
  nova: { name: 'Nova', cost: 120, range: 100, rate: 1.4, damage: 26, color: '#fb923c', splash: 50, slow: 0 },
  storm: { name: 'Storm', cost: 160, range: 120, rate: 0.25, damage: 9, color: '#a78bfa', splash: 0, slow: 0 },
} as const;
type Kind = keyof typeof TOWERS;

interface Tower { kind: Kind; x: number; y: number; level: number; cd: number }
interface Enemy { d: number; hp: number; max: number; speed: number; reward: number; slowT: number; boss: boolean }
interface Beam { x1: number; y1: number; x2: number; y2: number; t: number; color: string }

/** Position along the path at distance `d`. */
function along(d: number): { x: number; y: number; done: boolean } {
  let left = d;
  for (let k = 0; k < PATH.length - 1; k++) {
    const [x1, y1] = PATH[k]!;
    const [x2, y2] = PATH[k + 1]!;
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (left <= len) return { x: x1 + ((x2 - x1) * left) / len, y: y1 + ((y2 - y1) * left) / len, done: false };
    left -= len;
  }
  return { x: PATH.at(-1)![0], y: PATH.at(-1)![1], done: true };
}

function nearPath(x: number, y: number, margin: number) {
  for (let k = 0; k < PATH.length - 1; k++) {
    const [x1, y1] = PATH[k]!;
    const [x2, y2] = PATH[k + 1]!;
    const minX = Math.min(x1, x2) - margin;
    const maxX = Math.max(x1, x2) + margin;
    const minY = Math.min(y1, y2) - margin;
    const maxY = Math.max(y1, y2) + margin;
    if (x >= minX && x <= maxX && y >= minY && y <= maxY) return true;
  }
  return false;
}

class NeonSiege extends CanvasGame {
  private credits = 150;
  private lives = 20;
  private wave = 0;
  private towers: Tower[] = [];
  private enemies: Enemy[] = [];
  private beams: Beam[] = [];
  private spawnQueue: Enemy[] = [];
  private spawnT = 0;
  private selectedKind: Kind = 'pulse';
  private selectedTower = -1;
  private betweenWaves = 3;

  constructor(host: GameHost) {
    super(host, { width: W, height: H + 60, background: '#070b1d' });
  }

  protected reset() {
    this.credits = 150;
    this.lives = 20;
    this.wave = 0;
    this.towers = [];
    this.enemies = [];
    this.beams = [];
    this.spawnQueue = [];
    this.betweenWaves = 3;
  }

  private startWave() {
    this.wave++;
    const count = 8 + this.wave * 2;
    const hp = 30 * Math.pow(1.17, this.wave);
    for (let k = 0; k < count; k++) this.spawnQueue.push({ d: 0, hp, max: hp, speed: 55 + this.wave * 2 + (k % 3) * 6, reward: 5 + Math.floor(this.wave / 3), slowT: 0, boss: false });
    if (this.wave % 5 === 0) this.spawnQueue.push({ d: 0, hp: hp * 12, max: hp * 12, speed: 40, reward: 80, slowT: 0, boss: true });
  }

  private buttons() {
    return (Object.keys(TOWERS) as Kind[]).map((k, n) => ({ kind: k, rect: { x: 8 + n * 102, y: H + 8, w: 96, h: 44 } }));
  }

  private upgradeCost(t: Tower) {
    return Math.round(TOWERS[t.kind].cost * 0.8 * t.level);
  }

  protected update(dt: number) {
    const i = this.input;
    // UI: tower palette, upgrade/sell, and placement.
    for (const tap of i.taps) {
      const btn = this.buttons().find((b) => tap.x >= b.rect.x && tap.x <= b.rect.x + b.rect.w && tap.y >= b.rect.y && tap.y <= b.rect.y + b.rect.h);
      if (btn) {
        this.selectedKind = btn.kind;
        this.selectedTower = -1;
        continue;
      }
      if (tap.y > H) continue;
      const existing = this.towers.findIndex((t) => dist(t.x, t.y, tap.x, tap.y) < 18);
      if (existing >= 0) {
        if (this.selectedTower === existing) {
          const t = this.towers[existing]!;
          const cost = this.upgradeCost(t);
          if (t.level < 4 && this.credits >= cost) {
            this.credits -= cost;
            t.level++;
            this.sfx.good();
          }
        }
        this.selectedTower = existing;
        continue;
      }
      const spec = TOWERS[this.selectedKind];
      const clash = this.towers.some((t) => dist(t.x, t.y, tap.x, tap.y) < 36);
      if (!nearPath(tap.x, tap.y, 26) && !clash && this.credits >= spec.cost && tap.y > 30) {
        this.towers.push({ kind: this.selectedKind, x: tap.x, y: tap.y, level: 1, cd: 0 });
        this.credits -= spec.cost;
        this.selectedTower = -1;
        this.sfx.click();
      }
    }
    for (let k = 1; k <= 5; k++) if (i.hit(`Digit${k}`)) this.selectedKind = (Object.keys(TOWERS) as Kind[])[k - 1]!;
    if (i.hit('KeyN') && !this.enemies.length && !this.spawnQueue.length) this.betweenWaves = 0;

    if (!this.enemies.length && !this.spawnQueue.length) {
      if (this.wave >= WAVES) {
        this.addScore(this.lives * 100 + this.credits);
        this.sfx.win();
        this.end('won', { lives: this.lives });
        return;
      }
      this.betweenWaves -= dt;
      if (this.betweenWaves <= 0) {
        this.startWave();
        this.betweenWaves = 6;
      }
    }
    this.spawnT -= dt;
    if (this.spawnQueue.length && this.spawnT <= 0) {
      this.enemies.push(this.spawnQueue.shift()!);
      this.spawnT = 0.7;
    }
    for (const e of this.enemies) {
      e.slowT = Math.max(0, e.slowT - dt);
      e.d += e.speed * (e.slowT > 0 ? 0.5 : 1) * dt;
    }
    for (const e of this.enemies)
      if (along(e.d).done) {
        e.hp = 0;
        this.lives -= e.boss ? 5 : 1;
        this.sfx.bad();
      }
    if (this.lives <= 0) {
      this.end('lost', { wave: this.wave });
      return;
    }
    for (const t of this.towers) {
      const spec = TOWERS[t.kind];
      t.cd -= dt;
      if (t.cd > 0) continue;
      const range = spec.range * (1 + (t.level - 1) * 0.15);
      // Target the enemy furthest along the path within range.
      const target = this.enemies.filter((e) => e.hp > 0 && dist(along(e.d).x, along(e.d).y, t.x, t.y) <= range).sort((a, b) => b.d - a.d)[0];
      if (!target) continue;
      t.cd = spec.rate;
      const p = along(target.d);
      const dmg = spec.damage * (1 + (t.level - 1) * 0.6);
      if (spec.splash) {
        for (const e of this.enemies) if (e.hp > 0 && dist(along(e.d).x, along(e.d).y, p.x, p.y) <= spec.splash) e.hp -= dmg;
      } else {
        target.hp -= dmg;
      }
      if (spec.slow) target.slowT = 1.5;
      this.beams.push({ x1: t.x, y1: t.y, x2: p.x, y2: p.y, t: 0.12, color: spec.color });
    }
    for (const e of this.enemies)
      if (e.hp <= 0 && !along(e.d).done) {
        this.credits += e.reward;
        this.addScore(e.boss ? 200 : 10);
      }
    this.enemies = this.enemies.filter((e) => e.hp > 0);
    for (const b of this.beams) b.t -= dt;
    this.beams = this.beams.filter((b) => b.t > 0);
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 34;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    PATH.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.strokeStyle = 'rgba(124,92,255,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    for (const [n, t] of this.towers.entries()) {
      const spec = TOWERS[t.kind];
      if (n === this.selectedTower) {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.arc(t.x, t.y, spec.range * (1 + (t.level - 1) * 0.15), 0, Math.PI * 2);
        ctx.stroke();
      }
      this.glow(ctx, spec.color, 10);
      this.roundRect(ctx, t.x - 14, t.y - 14, 28, 28, 6, spec.color);
      this.noGlow(ctx);
      this.text(ctx, '★'.repeat(t.level), t.x, t.y + 26, { size: 9, align: 'center', color: '#fde047' });
    }
    for (const e of this.enemies) {
      const p = along(e.d);
      const r = e.boss ? 15 : 9;
      this.circle(ctx, p.x, p.y, r, e.slowT > 0 ? '#93c5fd' : e.boss ? '#f472b6' : '#e2e8f0');
      ctx.fillStyle = '#334155';
      ctx.fillRect(p.x - 12, p.y - r - 7, 24, 4);
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(p.x - 12, p.y - r - 7, 24 * Math.max(0, e.hp / e.max), 4);
    }
    for (const b of this.beams) {
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    ctx.fillStyle = '#0e1430';
    ctx.fillRect(0, H, W, 60);
    for (const b of this.buttons()) {
      const spec = TOWERS[b.kind];
      this.button(ctx, b.rect, `${spec.name} ${spec.cost}`, b.kind === this.selectedKind);
    }
    const sel = this.towers[this.selectedTower];
    const info = sel ? `Selected ${TOWERS[sel.kind].name} ★${sel.level} — tap again to upgrade (${sel.level < 4 ? this.upgradeCost(sel) : 'max'})` : 'Tap the field to build · N = next wave';
    this.hud(ctx, `Wave ${this.wave}/${WAVES} · ♥ ${this.lives} · ◈ ${this.credits}`, info);
  }
}

export default defineGame(
  { key: 'neon-siege', engine: 'CANVAS', aspectRatio: W / (H + 60), orientation: 'landscape', maxScore: 100_000, controls: [{ action: 'Build tower', keys: 'Pick a type (1–5), tap the field' }, { action: 'Upgrade', keys: 'Tap a tower twice' }, { action: 'Next wave', keys: 'N' }] },
  (host) => new NeonSiege(host),
);
