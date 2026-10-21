/**
 * Tile-based platformer physics shared by Pixel Jumper and Cave Explorer.
 * Axis-separated AABB collision against solid tiles, with coyote time, jump
 * buffering, variable jump height, wall slide/jump, double jump and dash.
 */
export const TILE = 24;

export interface TileMap {
  rows: string[];
  w: number;
  h: number;
}

export const parseMap = (rows: string[]): TileMap => ({ rows, w: Math.max(...rows.map((r) => r.length)), h: rows.length });
export const tileAt = (m: TileMap, c: number, r: number) => (r < 0 || c < 0 || c >= m.w ? '#' : r >= m.h ? '.' : (m.rows[r]![c] ?? '.'));
export const isSolid = (ch: string) => ch === '#' || ch === '=';

export function findTiles(m: TileMap, ch: string): { c: number; r: number }[] {
  const out: { c: number; r: number }[] = [];
  m.rows.forEach((row, r) => [...row].forEach((x, c) => x === ch && out.push({ c, r })));
  return out;
}

export interface Abilities {
  wallJump: boolean;
  doubleJump: boolean;
  dash: boolean;
}

export interface Actor {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  onGround: boolean;
  wallDir: -1 | 0 | 1;
  coyote: number;
  buffer: number;
  airJumps: number;
  dashTime: number;
  dashCooldown: number;
  facing: -1 | 1;
}

export interface ActorInput {
  left: boolean;
  right: boolean;
  jumpPressed: boolean;
  jumpHeld: boolean;
  dashPressed: boolean;
}

export const PHYS = { gravity: 1900, maxFall: 950, run: 230, accel: 2200, jump: 620, wallSlide: 140, dashSpeed: 620, dashTime: 0.17 };

export const newActor = (x: number, y: number): Actor => ({ x, y, w: 16, h: 22, vx: 0, vy: 0, onGround: false, wallDir: 0, coyote: 0, buffer: 0, airJumps: 0, dashTime: 0, dashCooldown: 0, facing: 1 });

function collides(m: TileMap, x: number, y: number, w: number, h: number) {
  const c0 = Math.floor(x / TILE);
  const c1 = Math.floor((x + w - 0.01) / TILE);
  const r0 = Math.floor(y / TILE);
  const r1 = Math.floor((y + h - 0.01) / TILE);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (isSolid(tileAt(m, c, r))) return true;
  return false;
}

export function stepActor(m: TileMap, a: Actor, input: ActorInput, ab: Abilities, dt: number) {
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (dir) a.facing = dir as -1 | 1;
  a.coyote = a.onGround ? 0.1 : Math.max(0, a.coyote - dt);
  a.buffer = input.jumpPressed ? 0.12 : Math.max(0, a.buffer - dt);
  a.dashCooldown = Math.max(0, a.dashCooldown - dt);
  if (a.onGround) a.airJumps = ab.doubleJump ? 1 : 0;

  if (ab.dash && input.dashPressed && a.dashCooldown === 0) {
    a.dashTime = PHYS.dashTime;
    a.dashCooldown = 0.6;
  }
  if (a.dashTime > 0) {
    a.dashTime -= dt;
    a.vx = a.facing * PHYS.dashSpeed;
    a.vy = 0;
  } else {
    const target = dir * PHYS.run;
    const accel = PHYS.accel * (a.onGround ? 1 : 0.7);
    a.vx += Math.max(-accel * dt, Math.min(accel * dt, target - a.vx));
    a.vy = Math.min(PHYS.maxFall, a.vy + PHYS.gravity * dt);
    if (ab.wallJump && a.wallDir && !a.onGround && a.vy > PHYS.wallSlide && dir === a.wallDir) a.vy = PHYS.wallSlide;
    if (a.buffer > 0) {
      if (a.onGround || a.coyote > 0) {
        a.vy = -PHYS.jump;
        a.buffer = 0;
        a.coyote = 0;
      } else if (ab.wallJump && a.wallDir) {
        a.vy = -PHYS.jump * 0.95;
        a.vx = -a.wallDir * PHYS.run * 1.1;
        a.buffer = 0;
      } else if (a.airJumps > 0) {
        a.vy = -PHYS.jump * 0.9;
        a.airJumps--;
        a.buffer = 0;
      }
    }
    if (!input.jumpHeld && a.vy < -200) a.vy = -200; // variable jump height
  }

  // Horizontal
  a.x += a.vx * dt;
  if (collides(m, a.x, a.y, a.w, a.h)) {
    if (a.vx > 0) a.x = Math.floor((a.x + a.w) / TILE) * TILE - a.w - 0.01;
    else if (a.vx < 0) a.x = Math.floor(a.x / TILE + 1) * TILE + 0.01;
    a.vx = 0;
  }
  // Vertical
  a.y += a.vy * dt;
  a.onGround = false;
  if (collides(m, a.x, a.y, a.w, a.h)) {
    if (a.vy > 0) {
      a.y = Math.floor((a.y + a.h) / TILE) * TILE - a.h - 0.01;
      a.onGround = true;
    } else if (a.vy < 0) a.y = Math.floor(a.y / TILE + 1) * TILE + 0.01;
    a.vy = 0;
  }
  a.wallDir = collides(m, a.x + 1.5, a.y + 2, a.w, a.h - 4) ? 1 : collides(m, a.x - 1.5, a.y + 2, a.w, a.h - 4) ? -1 : 0;
}

/** Tiles the actor currently overlaps (for pickups and hazards). */
export function overlappingTiles(a: Actor): { c: number; r: number }[] {
  const out: { c: number; r: number }[] = [];
  for (let r = Math.floor(a.y / TILE); r <= Math.floor((a.y + a.h) / TILE); r++)
    for (let c = Math.floor(a.x / TILE); c <= Math.floor((a.x + a.w) / TILE); c++) out.push({ c, r });
  return out;
}

/**
 * Coarse reachability check used by tests: BFS over standing tiles with a jump
 * envelope (conservative relative to the real physics). Returns reachable cells.
 */
export function reachable(m: TileMap, start: { c: number; r: number }, ab: Abilities): Set<string> {
  const open = (c: number, r: number) => !isSolid(tileAt(m, c, r)) && tileAt(m, c, r) !== '^';
  const standing = (c: number, r: number) => open(c, r) && isSolid(tileAt(m, c, r + 1));
  const fallFrom = (c: number, r: number) => {
    let rr = r;
    while (rr < m.h && open(c, rr + 1) && !isSolid(tileAt(m, c, rr + 1))) rr++;
    return standing(c, rr) ? rr : -1;
  };
  const maxUp = ab.doubleJump ? 6 : 3;
  const maxDx = ab.dash ? 9 : 4;
  const seen = new Set<string>();
  const queue: [number, number][] = [];
  const s = fallFrom(start.c, start.r);
  if (s >= 0) {
    queue.push([start.c, s]);
    seen.add(`${start.c},${s}`);
  }
  const push = (c: number, r: number) => {
    const k = `${c},${r}`;
    if (!seen.has(k)) {
      seen.add(k);
      queue.push([c, r]);
    }
  };
  while (queue.length) {
    const [c, r] = queue.shift()!;
    for (const dc of [-1, 1]) {
      if (!open(c + dc, r)) continue;
      if (standing(c + dc, r)) push(c + dc, r);
      else {
        const f = fallFrom(c + dc, r);
        if (f >= 0) push(c + dc, f);
      }
    }
    // Jumps: the column above the start must be clear up to the apex.
    for (let up = 1; up <= maxUp; up++) if (!open(c, r - up)) break;
    for (let dc = -maxDx; dc <= maxDx; dc++)
      for (let dr = -maxUp; dr <= m.h; dr++) {
        const tc = c + dc;
        const tr = r + dr;
        if (!standing(tc, tr)) continue;
        const apex = Math.min(r, tr) - 1;
        let clear = true;
        for (let k = Math.min(c, tc); k <= Math.max(c, tc) && clear; k++) if (!open(k, apex) || !open(k, Math.min(r, tr))) clear = false;
        for (let k = apex; k <= r && clear; k++) if (!open(c, k)) clear = false;
        for (let k = apex; k <= tr && clear; k++) if (!open(tc, k)) clear = false;
        if (clear) push(tc, tr);
      }
  }
  return seen;
}
