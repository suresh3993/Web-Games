import type { Rng } from '../../kit/util';

export const SIZE = 8;
export const KINDS = 6;

/** color: 0..KINDS-1; special: none | line (clears its row+column) | star (clears every gem of a colour) */
export interface Gem {
  color: number;
  special: 'none' | 'line' | 'star';
}
export type Board = (Gem | null)[];

export const idx = (r: number, c: number) => r * SIZE + c;

export function randomBoard(random: Rng): Board {
  const b: Board = Array(SIZE * SIZE).fill(null);
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      let color: number;
      do color = Math.floor(random() * KINDS);
      while (
        (c >= 2 && b[idx(r, c - 1)]?.color === color && b[idx(r, c - 2)]?.color === color) ||
        (r >= 2 && b[idx(r - 1, c)]?.color === color && b[idx(r - 2, c)]?.color === color)
      );
      b[idx(r, c)] = { color, special: 'none' };
    }
  return b;
}

/** Runs of 3+ equal colours. Each run is a list of indices. */
export function findRuns(b: Board): number[][] {
  const runs: number[][] = [];
  for (let r = 0; r < SIZE; r++) {
    let run = [idx(r, 0)];
    for (let c = 1; c <= SIZE; c++) {
      const same = c < SIZE && b[idx(r, c)] && b[idx(r, c)]!.color === b[run[0]!]?.color;
      if (same) run.push(idx(r, c));
      else {
        if (run.length >= 3 && b[run[0]!]) runs.push(run);
        run = [idx(r, Math.min(c, SIZE - 1))];
      }
    }
  }
  for (let c = 0; c < SIZE; c++) {
    let run = [idx(0, c)];
    for (let r = 1; r <= SIZE; r++) {
      const same = r < SIZE && b[idx(r, c)] && b[idx(r, c)]!.color === b[run[0]!]?.color;
      if (same) run.push(idx(r, c));
      else {
        if (run.length >= 3 && b[run[0]!]) runs.push(run);
        run = [idx(Math.min(r, SIZE - 1), c)];
      }
    }
  }
  return runs;
}

export const adjacent = (a: number, b: number) => {
  const dr = Math.abs(Math.floor(a / SIZE) - Math.floor(b / SIZE));
  const dc = Math.abs((a % SIZE) - (b % SIZE));
  return dr + dc === 1;
};

export function swap(b: Board, a: number, c: number): Board {
  const next = [...b];
  [next[a], next[c]] = [next[c]!, next[a]!];
  return next;
}

export const isValidSwap = (b: Board, a: number, c: number) => adjacent(a, c) && findRuns(swap(b, a, c)).length > 0;

export function hasMove(b: Board): boolean {
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (i % SIZE < SIZE - 1 && isValidSwap(b, i, i + 1)) return true;
    if (i + SIZE < SIZE * SIZE && isValidSwap(b, i, i + SIZE)) return true;
  }
  return false;
}

/**
 * Clears all current runs (expanding special gems), creates new specials for runs of
 * 4 (line) and 5+ (star) at `focus` (the swapped cell) when part of that run, then
 * applies gravity and refills. Returns cleared count; call repeatedly for cascades.
 */
export function resolveStep(b: Board, random: Rng, focus: number[] = []): { board: Board; cleared: number } {
  const runs = findRuns(b);
  if (!runs.length) return { board: b, cleared: 0 };
  const next = [...b];
  const clear = new Set<number>();
  const create: { at: number; gem: Gem }[] = [];
  for (const run of runs) {
    run.forEach((i) => clear.add(i));
    if (run.length >= 4) {
      const at = run.find((i) => focus.includes(i)) ?? run[Math.floor(run.length / 2)]!;
      create.push({ at, gem: { color: b[at]!.color, special: run.length >= 5 ? 'star' : 'line' } });
    }
  }
  // Expand specials caught in the blast.
  const queue = [...clear];
  while (queue.length) {
    const i = queue.pop()!;
    const g = b[i];
    if (!g || g.special === 'none') continue;
    const extra: number[] = [];
    if (g.special === 'line') {
      const r = Math.floor(i / SIZE);
      const c = i % SIZE;
      for (let k = 0; k < SIZE; k++) extra.push(idx(r, k), idx(k, c));
    } else {
      b.forEach((o, j) => o && o.color === g.color && extra.push(j));
    }
    for (const e of extra) if (!clear.has(e)) {
      clear.add(e);
      queue.push(e);
    }
  }
  for (const i of clear) next[i] = null;
  for (const { at, gem } of create) next[at] = gem;
  // Gravity + refill.
  for (let c = 0; c < SIZE; c++) {
    const column: (Gem | null)[] = [];
    for (let r = SIZE - 1; r >= 0; r--) if (next[idx(r, c)]) column.push(next[idx(r, c)]!);
    for (let r = SIZE - 1, k = 0; r >= 0; r--, k++) {
      next[idx(r, c)] = column[k] ?? { color: Math.floor(random() * KINDS), special: 'none' };
    }
  }
  return { board: next, cleared: clear.size - create.length };
}
