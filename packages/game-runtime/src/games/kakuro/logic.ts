import { shuffle, type Rng } from '../../kit/util';

export interface KakuroPuzzle {
  n: number;
  white: boolean[];
  /** Clues on black cells: across = sum of the run to the right, down = run below. */
  across: (number | null)[];
  down: (number | null)[];
  solution: number[];
}

/** Runs (lists of cell indices) of white cells in a direction. */
export function runs(white: boolean[], n: number, horizontal: boolean): number[][] {
  const out: number[][] = [];
  for (let a = 0; a < n; a++) {
    let run: number[] = [];
    for (let b = 0; b <= n; b++) {
      const i = horizontal ? a * n + b : b * n + a;
      if (b < n && white[i]) run.push(i);
      else {
        if (run.length) out.push(run);
        run = [];
      }
    }
  }
  return out;
}

function makeLayout(n: number, random: Rng): boolean[] {
  for (let attempt = 0; attempt < 500; attempt++) {
    const white = Array.from({ length: n * n }, (_, i) => i >= n && i % n !== 0 && random() > 0.18);
    // Repair: every white cell must sit in runs of length 2–6 in both directions.
    let changed = true;
    while (changed) {
      changed = false;
      for (const horizontal of [true, false])
        for (const run of runs(white, n, horizontal)) {
          if (run.length === 1) {
            white[run[0]!] = false;
            changed = true;
          } else if (run.length > 6) {
            white[run[Math.floor(run.length / 2)]!] = false;
            changed = true;
          }
        }
    }
    if (white.filter(Boolean).length >= n * n * 0.45) return white;
  }
  throw new Error('layout failed');
}

/** Fills digits 1–9 so no run repeats a digit (randomised backtracking). */
function fill(white: boolean[], n: number, random: Rng): number[] | null {
  const across = runs(white, n, true);
  const down = runs(white, n, false);
  const runOf = new Map<number, number[][]>();
  for (const r of [...across, ...down]) for (const i of r) runOf.set(i, [...(runOf.get(i) ?? []), r]);
  const cells = white.flatMap((w, i) => (w ? [i] : []));
  const values = Array(n * n).fill(0);
  let steps = 0;
  const go = (k: number): boolean => {
    if (++steps > 20000) return false;
    if (k === cells.length) return true;
    const i = cells[k]!;
    const used = new Set(runOf.get(i)!.flatMap((r) => r.map((j) => values[j])));
    for (const d of shuffle(random, [1, 2, 3, 4, 5, 6, 7, 8, 9])) {
      if (used.has(d)) continue;
      values[i] = d;
      if (go(k + 1)) return true;
    }
    values[i] = 0;
    return false;
  };
  return go(0) ? values : null;
}

export function generateKakuro(n: number, random: Rng): KakuroPuzzle {
  for (;;) {
    const white = makeLayout(n, random);
    const solution = fill(white, n, random);
    if (!solution) continue;
    const across: (number | null)[] = Array(n * n).fill(null);
    const down: (number | null)[] = Array(n * n).fill(null);
    for (const run of runs(white, n, true)) across[run[0]! - 1] = run.reduce((s, i) => s + solution[i]!, 0);
    for (const run of runs(white, n, false)) down[run[0]! - n] = run.reduce((s, i) => s + solution[i]!, 0);
    return { n, white, across, down, solution };
  }
}

/** Any entry satisfying every sum with no repeated digit in a run is accepted. */
export function checkKakuro(p: KakuroPuzzle, values: number[]): boolean {
  if (p.white.some((w, i) => w && !values[i])) return false;
  for (const horizontal of [true, false])
    for (const run of runs(p.white, p.n, horizontal)) {
      const digits = run.map((i) => values[i]!);
      if (new Set(digits).size !== digits.length) return false;
      const clue = horizontal ? p.across[run[0]! - 1] : p.down[run[0]! - p.n];
      if (digits.reduce((a, b) => a + b, 0) !== clue) return false;
    }
  return true;
}
