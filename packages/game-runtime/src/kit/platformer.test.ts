import { describe, expect, it } from 'vitest';
import { createRng } from '../core/random';
import { findTiles, newActor, parseMap, PHYS, reachable, stepActor, TILE } from './platformer';
import { generateLevel } from './platformer-gen';

const reached = (seen: Set<string>, t: { c: number; r: number }) => [0, 1, 2].some((d) => seen.has(`${t.c},${t.r + d}`));
const none = { wallJump: false, doubleJump: false, dash: false };

describe('platformer physics', () => {
  it('lands on the floor and jumps about four tiles high', () => {
    const m = parseMap(['..........', '..........', '..........', '..........', '..........', '..........', '..........', '##########']);
    const a = newActor(40, 100);
    const idle = { left: false, right: false, jumpPressed: false, jumpHeld: false, dashPressed: false };
    for (let k = 0; k < 120; k++) stepActor(m, a, idle, none, 1 / 60);
    expect(a.onGround).toBe(true);
    const groundY = a.y;
    stepActor(m, a, { ...idle, jumpPressed: true, jumpHeld: true }, none, 1 / 60);
    let top = a.y;
    for (let k = 0; k < 60; k++) {
      stepActor(m, a, { ...idle, jumpHeld: true }, none, 1 / 60);
      top = Math.min(top, a.y);
    }
    const height = (groundY - top) / TILE;
    expect(height).toBeGreaterThan(3.5);
    expect(height).toBeLessThan(PHYS.jump ** 2 / (2 * PHYS.gravity) / TILE + 0.5);
  });
});

describe('generated levels are completable', () => {
  it('every gem, checkpoint and exit is reachable without abilities', () => {
    for (let n = 0; n < 25; n++) {
      const m = parseMap(generateLevel(createRng(`pj${n}`), { segments: 9 + (n % 7), difficulty: (n % 8) / 7 }));
      const seen = reachable(m, findTiles(m, 'P')[0]!, none);
      for (const ch of ['E', '*', 'C']) for (const t of findTiles(m, ch)) expect(reached(seen, t), `seed ${n} ${ch}`).toBe(true);
    }
  });

  it('cave gates require the double jump and dash abilities', () => {
    for (let n = 0; n < 12; n++) {
      const m = parseMap(generateLevel(createRng(`cv${n}`), { segments: 16, difficulty: 0.5, gates: true }));
      const p = findTiles(m, 'P')[0]!;
      const base = reachable(m, p, none);
      const full = reachable(m, p, { wallJump: false, doubleJump: true, dash: true });
      expect(reached(base, findTiles(m, 'D')[0]!)).toBe(true);
      expect(reached(base, findTiles(m, 'E')[0]!)).toBe(false);
      expect(reached(full, findTiles(m, 'E')[0]!)).toBe(true);
      for (const r of findTiles(m, 'R')) expect(reached(full, r)).toBe(true);
    }
  });
});
