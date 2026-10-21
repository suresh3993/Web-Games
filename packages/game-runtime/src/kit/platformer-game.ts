import type { GameHost } from '../interfaces/game-module';
import { CanvasGame } from './canvas-game';
import { findTiles, isSolid, newActor, overlappingTiles, parseMap, stepActor, TILE, tileAt, type Abilities, type Actor, type TileMap } from './platformer';

export const VIEW_W = 640;
export const VIEW_H = 384;

/** Shared side-scrolling platformer: map, actor, pickups, hazards, camera and rendering. */
export abstract class PlatformerGame extends CanvasGame {
  protected map!: TileMap;
  protected actor!: Actor;
  protected abilities: Abilities = { wallJump: false, doubleJump: false, dash: false };
  protected collected = new Set<string>();
  protected checkpoint = { x: 0, y: 0 };
  protected deaths = 0;
  protected camX = 0;
  protected banner = '';
  protected bannerT = 0;

  constructor(host: GameHost) {
    super(host, { width: VIEW_W, height: VIEW_H, background: '#0b1230' });
  }

  /** Called when the actor touches a pickup tile ('*', 'C', 'D', 'S', 'R', 'E'). */
  protected abstract onPickup(ch: string, c: number, r: number): void;

  protected loadMap(rows: string[]) {
    this.map = parseMap(rows);
    const p = findTiles(this.map, 'P')[0]!;
    this.actor = newActor(p.c * TILE + 4, p.r * TILE + 1);
    this.checkpoint = { x: this.actor.x, y: this.actor.y };
    this.collected = new Set();
  }

  protected say(text: string) {
    this.banner = text;
    this.bannerT = 2;
  }

  protected die() {
    this.deaths++;
    this.sfx.bad();
    this.actor = { ...newActor(this.checkpoint.x, this.checkpoint.y), facing: this.actor.facing };
  }

  protected update(dt: number) {
    const i = this.input;
    const touchLeft = i.pointer.down && i.pointer.x < VIEW_W * 0.3;
    const touchRight = i.pointer.down && i.pointer.x > VIEW_W * 0.3 && i.pointer.x < VIEW_W * 0.6;
    const touchJump = i.taps.some((t) => t.x >= VIEW_W * 0.6 && t.y > VIEW_H * 0.35);
    const touchDash = i.taps.some((t) => t.x >= VIEW_W * 0.6 && t.y <= VIEW_H * 0.35);
    stepActor(
      this.map,
      this.actor,
      {
        left: i.left || touchLeft,
        right: i.right || touchRight,
        jumpPressed: i.anyHit('Space', 'ArrowUp', 'KeyW', 'KeyZ') || touchJump,
        jumpHeld: i.any('Space', 'ArrowUp', 'KeyW', 'KeyZ') || (i.pointer.down && i.pointer.x >= VIEW_W * 0.6),
        dashPressed: i.anyHit('ShiftLeft', 'ShiftRight', 'KeyX') || touchDash,
      },
      this.abilities,
      dt,
    );
    for (const { c, r } of overlappingTiles(this.actor)) {
      const ch = tileAt(this.map, c, r);
      if (ch === '^') return this.die();
      if ('*CDSRE'.includes(ch) && ch !== '.') {
        const key = `${c},${r}`;
        if (this.collected.has(key) && ch !== 'E') continue;
        this.collected.add(key);
        if (ch === 'C') this.checkpoint = { x: c * TILE + 4, y: r * TILE - 2 };
        this.onPickup(ch, c, r);
        if (this.finished) return;
      }
    }
    if (this.actor.y > this.map.h * TILE + 40) this.die();
    const target = this.actor.x - VIEW_W * 0.4;
    this.camX = Math.max(0, Math.min(this.map.w * TILE - VIEW_W, this.camX + (target - this.camX) * Math.min(1, dt * 8)));
    this.bannerT = Math.max(0, this.bannerT - dt);
  }

  protected drawWorld(ctx: CanvasRenderingContext2D) {
    const camY = Math.max(0, this.map.h * TILE - VIEW_H);
    ctx.save();
    ctx.translate(-Math.round(this.camX), -camY);
    const c0 = Math.floor(this.camX / TILE);
    const c1 = c0 + Math.ceil(VIEW_W / TILE) + 1;
    for (let r = 0; r < this.map.h; r++)
      for (let c = c0; c <= c1; c++) {
        const ch = tileAt(this.map, c, r);
        const x = c * TILE;
        const y = r * TILE;
        if (isSolid(ch)) {
          ctx.fillStyle = r > 0 && !isSolid(tileAt(this.map, c, r - 1)) ? '#7c3aed' : '#3b2a7a';
          ctx.fillRect(x, y, TILE, TILE);
        } else if (ch === '^') {
          ctx.fillStyle = '#f43f5e';
          for (let k = 0; k < 3; k++) {
            ctx.beginPath();
            ctx.moveTo(x + k * 8, y + TILE);
            ctx.lineTo(x + k * 8 + 4, y + 8);
            ctx.lineTo(x + k * 8 + 8, y + TILE);
            ctx.fill();
          }
        } else if (!this.collected.has(`${c},${r}`) || ch === 'E') {
          if (ch === '*') this.circle(ctx, x + 12, y + 12 + Math.sin(this.time * 4 + c) * 2, 6, '#22d3ee');
          if (ch === 'C') this.roundRect(ctx, x + 9, y + 2, 6, 22, 2, '#facc15');
          if (ch === 'E') this.roundRect(ctx, x + 2, y - 10, 20, 34, 4, '#4ade80');
          if (ch === 'D') this.text(ctx, '⇈', x + 12, y + 18, { size: 18, align: 'center', color: '#a5f3fc' });
          if (ch === 'S') this.text(ctx, '»', x + 12, y + 18, { size: 22, align: 'center', color: '#fde047' });
          if (ch === 'R') this.text(ctx, '◆', x + 12, y + 18, { size: 18, align: 'center', color: '#f472b6' });
        } else if (ch === 'C') this.roundRect(ctx, x + 9, y + 2, 6, 22, 2, '#4ade80');
      }
    const a = this.actor;
    this.glow(ctx, a.dashTime > 0 ? '#fde047' : '#22d3ee', 10);
    this.roundRect(ctx, a.x, a.y, a.w, a.h, 4, a.dashTime > 0 ? '#fde047' : '#22d3ee');
    this.noGlow(ctx);
    ctx.fillStyle = '#0b1230';
    ctx.fillRect(a.x + (a.facing > 0 ? 10 : 3), a.y + 6, 3, 4);
    ctx.restore();
    if (this.bannerT > 0) this.text(ctx, this.banner, VIEW_W / 2, 64, { size: 20, align: 'center', color: '#fde047' });
  }
}
