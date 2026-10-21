import type { GameHost } from '../../interfaces/game-module';
import { CanvasGame } from '../../kit/canvas-game';
import { defineGame } from '../../kit/define';
import { clamp, dist } from '../../kit/util';

const W = 480;
const H = 640;

interface Bullet { x: number; y: number; vx: number; vy: number; enemy: boolean }
interface Enemy { x: number; y: number; baseX: number; t: number; hp: number; maxHp: number; boss: boolean; fire: number; r: number; score: number }
interface Drop { x: number; y: number }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; color: string }

class SpaceDefender extends CanvasGame {
  private ship = { x: W / 2, y: H - 70 };
  private bullets: Bullet[] = [];
  private enemies: Enemy[] = [];
  private drops: Drop[] = [];
  private sparks: Spark[] = [];
  private stars: { x: number; y: number; s: number }[] = [];
  private lives = 3;
  private wave = 0;
  private fireCd = 0;
  private spread = 0;
  private shield = 0;
  private shieldCd = 0;
  private invuln = 0;
  private waveDelay = 0;

  constructor(host: GameHost) {
    super(host, { width: W, height: H, background: '#05081a' });
  }

  protected reset() {
    this.ship = { x: W / 2, y: H - 70 };
    this.bullets = [];
    this.enemies = [];
    this.drops = [];
    this.sparks = [];
    this.lives = 3;
    this.wave = 0;
    this.spread = 0;
    this.shield = 0;
    this.shieldCd = 0;
    this.invuln = 0;
    this.waveDelay = 1;
    this.stars = Array.from({ length: 60 }, () => ({ x: this.random() * W, y: this.random() * H, s: 20 + this.random() * 80 }));
  }

  private spawnWave() {
    this.wave++;
    if (this.wave % 5 === 0) {
      const hp = 40 + this.wave * 8;
      this.enemies.push({ x: W / 2, y: -60, baseX: W / 2, t: 0, hp, maxHp: hp, boss: true, fire: 1, r: 46, score: 1000 * (this.wave / 5) });
      return;
    }
    const count = Math.min(14, 5 + this.wave);
    for (let i = 0; i < count; i++) {
      const col = i % 7;
      const row = Math.floor(i / 7);
      const hp = 1 + Math.floor(this.wave / 4);
      this.enemies.push({ x: 60 + col * 60, y: -40 - row * 50, baseX: 60 + col * 60, t: this.random() * 6, hp, maxHp: hp, boss: false, fire: 1 + this.random() * 3, r: 16, score: 50 });
    }
  }

  private burst(x: number, y: number, color: string, n = 12) {
    if (this.reducedMotion) n = Math.min(n, 4);
    for (let i = 0; i < n; i++) {
      const a = this.random() * Math.PI * 2;
      const s = 60 + this.random() * 160;
      this.sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5, color });
    }
  }

  private hitShip() {
    if (this.invuln > 0 || this.shield > 0) return;
    this.lives--;
    this.invuln = 2;
    this.spread = 0;
    this.burst(this.ship.x, this.ship.y, '#22d3ee', 20);
    this.sfx.bad();
    if (this.lives <= 0) this.end('lost', { wave: this.wave });
  }

  protected update(dt: number) {
    const i = this.input;
    for (const s of this.stars) {
      s.y += s.s * dt;
      if (s.y > H) s.y = 0;
    }
    // Movement: keyboard or drag.
    if (i.pointer.down) {
      this.ship.x += (i.pointer.x - this.ship.x) * Math.min(1, dt * 12);
      this.ship.y += (i.pointer.y - 40 - this.ship.y) * Math.min(1, dt * 12);
    } else {
      const speed = 300;
      if (i.left) this.ship.x -= speed * dt;
      if (i.right) this.ship.x += speed * dt;
      if (i.up) this.ship.y -= speed * dt;
      if (i.down) this.ship.y += speed * dt;
    }
    this.ship.x = clamp(this.ship.x, 20, W - 20);
    this.ship.y = clamp(this.ship.y, H / 2, H - 30);

    // Shield (shift, E, or a quick double tap).
    this.shieldCd = Math.max(0, this.shieldCd - dt);
    this.shield = Math.max(0, this.shield - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.shieldCd === 0 && (i.anyHit('ShiftLeft', 'ShiftRight', 'KeyE') || i.taps.length > 1)) {
      this.shield = 3;
      this.shieldCd = 10;
      this.sfx.beep(880, 0.15, 'sine');
    }

    // Auto-fire.
    this.fireCd -= dt;
    if (this.fireCd <= 0) {
      this.fireCd = 0.18;
      const angles = this.spread > 0 ? [-0.18, 0, 0.18] : [0];
      for (const a of angles) this.bullets.push({ x: this.ship.x, y: this.ship.y - 18, vx: Math.sin(a) * 600, vy: -Math.cos(a) * 600, enemy: false });
    }
    this.spread = Math.max(0, this.spread - dt);

    // Waves.
    if (!this.enemies.length) {
      this.waveDelay -= dt;
      if (this.waveDelay <= 0) {
        this.spawnWave();
        this.waveDelay = 1.5;
      }
    }

    for (const e of this.enemies) {
      e.t += dt;
      if (e.boss) {
        e.y = Math.min(110, e.y + 60 * dt);
        e.x = W / 2 + Math.sin(e.t * 0.8) * 150;
      } else {
        e.y += (40 + this.wave * 4) * dt;
        e.x = e.baseX + Math.sin(e.t * 1.6) * 40;
      }
      e.fire -= dt;
      if (e.fire <= 0 && e.y > 0) {
        if (e.boss) {
          for (let k = -2; k <= 2; k++) this.bullets.push({ x: e.x, y: e.y + 30, vx: k * 60, vy: 220, enemy: true });
          e.fire = 1.1;
        } else {
          const dx = this.ship.x - e.x;
          const dy = this.ship.y - e.y;
          const d = Math.hypot(dx, dy) || 1;
          this.bullets.push({ x: e.x, y: e.y + 10, vx: (dx / d) * 200, vy: (dy / d) * 200, enemy: true });
          e.fire = 2 + this.random() * 3;
        }
      }
      if (e.y > H + 40) e.hp = 0; // escaped
      if (!e.boss && dist(e.x, e.y, this.ship.x, this.ship.y) < e.r + 14) {
        e.hp = 0;
        this.hitShip();
      }
    }

    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.enemy) {
        if (this.shield > 0 && dist(b.x, b.y, this.ship.x, this.ship.y) < 30) b.y = -999;
        else if (dist(b.x, b.y, this.ship.x, this.ship.y) < 12) {
          b.y = -999;
          this.hitShip();
        }
      } else {
        for (const e of this.enemies) {
          if (e.hp > 0 && dist(b.x, b.y, e.x, e.y) < e.r) {
            e.hp--;
            b.y = -999;
            if (e.hp <= 0) {
              this.addScore(e.score * Math.max(1, Math.ceil(this.wave / 3)));
              this.burst(e.x, e.y, e.boss ? '#f472b6' : '#facc15', e.boss ? 40 : 12);
              this.sfx.beep(e.boss ? 120 : 300, 0.12, 'sawtooth', 0.04);
              if (e.boss || this.random() < 0.08) this.drops.push({ x: e.x, y: e.y });
            }
            break;
          }
        }
      }
    }
    this.bullets = this.bullets.filter((b) => b.y > -20 && b.y < H + 20 && b.x > -20 && b.x < W + 20);
    this.enemies = this.enemies.filter((e) => e.hp > 0);

    for (const d of this.drops) d.y += 120 * dt;
    this.drops = this.drops.filter((d) => {
      if (dist(d.x, d.y, this.ship.x, this.ship.y) < 24) {
        this.spread = 12;
        this.sfx.good();
        return false;
      }
      return d.y < H + 20;
    });
    for (const s of this.sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
  }

  protected draw(ctx: CanvasRenderingContext2D) {
    for (const s of this.stars) {
      ctx.fillStyle = `rgba(255,255,255,${s.s / 120})`;
      ctx.fillRect(s.x, s.y, 2, 2);
    }
    for (const e of this.enemies) {
      const color = e.boss ? '#f472b6' : e.hp > 1 ? '#fb923c' : '#facc15';
      this.glow(ctx, color, 12);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y + e.r);
      ctx.lineTo(e.x - e.r, e.y - e.r * 0.4);
      ctx.lineTo(e.x, e.y - e.r * 0.8);
      ctx.lineTo(e.x + e.r, e.y - e.r * 0.4);
      ctx.closePath();
      ctx.fill();
      if (e.boss) {
        this.noGlow(ctx);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(W / 2 - 120, 44, 240, 8);
        ctx.fillStyle = '#f472b6';
        ctx.fillRect(W / 2 - 120, 44, (240 * e.hp) / e.maxHp, 8);
      }
    }
    this.noGlow(ctx);
    for (const b of this.bullets) {
      ctx.fillStyle = b.enemy ? '#fb7185' : '#67e8f9';
      ctx.fillRect(b.x - 2, b.y - 6, 4, 12);
    }
    for (const d of this.drops) {
      this.circle(ctx, d.x, d.y, 10, '#4ade80');
      this.text(ctx, 'S', d.x, d.y + 4, { size: 12, color: '#05081a', align: 'center' });
    }
    for (const s of this.sparks) {
      ctx.globalAlpha = Math.max(0, s.life * 2);
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x, s.y, 3, 3);
    }
    ctx.globalAlpha = 1;
    if (!this.finished && (this.invuln === 0 || Math.floor(this.time * 10) % 2 === 0)) {
      this.glow(ctx, '#22d3ee', 16);
      ctx.fillStyle = '#22d3ee';
      ctx.beginPath();
      ctx.moveTo(this.ship.x, this.ship.y - 20);
      ctx.lineTo(this.ship.x - 16, this.ship.y + 14);
      ctx.lineTo(this.ship.x, this.ship.y + 6);
      ctx.lineTo(this.ship.x + 16, this.ship.y + 14);
      ctx.closePath();
      ctx.fill();
      this.noGlow(ctx);
      if (this.shield > 0) {
        ctx.strokeStyle = 'rgba(167,139,250,0.8)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(this.ship.x, this.ship.y, 30, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    this.hud(ctx, `Score ${this.score}`, `Wave ${this.wave}  ${'♥'.repeat(Math.max(0, this.lives))}`);
    this.text(ctx, this.shieldCd > 0 ? `Shield ${Math.ceil(this.shieldCd)}s` : 'Shield ready (Shift / double-tap)', 12, H - 12, { size: 12, color: '#9aa0c0', font: 'body' });
  }
}

export default defineGame(
  {
    key: 'space-defender',
    engine: 'CANVAS',
    aspectRatio: W / H,
    orientation: 'portrait',
    maxScore: 2_000_000,
    controls: [
      { action: 'Move', keys: 'Arrows / WASD / drag' },
      { action: 'Fire', keys: 'Automatic' },
      { action: 'Shield', keys: 'Shift / E / double-tap' },
    ],
  },
  (host) => new SpaceDefender(host),
);
