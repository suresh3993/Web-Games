import type { Rng } from '../../kit/util';

export interface Island {
  r: number;
  c: number;
  need: number;
}
export type Bridges = Map<string, number>; // "a-b" (a<b) → 1 | 2

export const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** Cells strictly between two aligned islands. */
export function between(a: Island, b: Island): [number, number][] {
  const cells: [number, number][] = [];
  if (a.r === b.r) for (let c = Math.min(a.c, b.c) + 1; c < Math.max(a.c, b.c); c++) cells.push([a.r, c]);
  else for (let r = Math.min(a.r, b.r) + 1; r < Math.max(a.r, b.r); r++) cells.push([r, a.c]);
  return cells;
}

/** Generates islands by growing a connected bridge network (counts derived from it), so a solution always exists. */
export function generateBridges(n: number, target: number, random: Rng): { islands: Island[]; solution: Bridges } {
  for (;;) {
    const grid = Array.from({ length: n }, () => Array<number>(n).fill(-1)); // island index
    const used = Array.from({ length: n }, () => Array<boolean>(n).fill(false)); // bridge cells
    const islands: Island[] = [{ r: Math.floor(random() * n), c: Math.floor(random() * n), need: 0 }];
    grid[islands[0]!.r]![islands[0]!.c] = 0;
    const solution: Bridges = new Map();
    let guard = 0;
    while (islands.length < target && guard++ < 2000) {
      const from = Math.floor(random() * islands.length);
      const src = islands[from]!;
      const [dr, dc] = [[0, 1], [1, 0], [0, -1], [-1, 0]][Math.floor(random() * 4)]!;
      const len = 2 + Math.floor(random() * (n / 2));
      const r = src.r + dr! * len;
      const c = src.c + dc! * len;
      if (r < 0 || c < 0 || r >= n || c >= n || grid[r]![c]! >= 0) continue;
      // Neighbouring islands must not be adjacent (keeps the puzzle readable).
      if ([[0, 1], [1, 0], [0, -1], [-1, 0]].some(([a, b]) => grid[r + a!]?.[c + b!] !== undefined && grid[r + a!]![c + b!]! >= 0)) continue;
      const path = between(src, { r, c, need: 0 });
      if (path.some(([pr, pc]) => grid[pr]![pc]! >= 0 || used[pr]![pc])) continue;
      path.forEach(([pr, pc]) => (used[pr]![pc] = true));
      const idx = islands.length;
      islands.push({ r, c, need: 0 });
      grid[r]![c] = idx;
      solution.set(key(from, idx), random() < 0.35 ? 2 : 1);
    }
    if (islands.length < target) continue;
    for (const [k, v] of solution) {
      const [a, b] = k.split('-').map(Number) as [number, number];
      islands[a]!.need += v;
      islands[b]!.need += v;
    }
    return { islands, solution };
  }
}

/** The island directly reachable from `a` in each direction (nearest aligned). */
export function neighbour(islands: Island[], a: number, b: number): boolean {
  const A = islands[a]!;
  const B = islands[b]!;
  if (a === b || (A.r !== B.r && A.c !== B.c)) return false;
  return !between(A, B).some(([r, c]) => islands.some((I) => I.r === r && I.c === c));
}

export function crosses(islands: Island[], bridges: Bridges, a: number, b: number): boolean {
  const cells = new Set(between(islands[a]!, islands[b]!).map(([r, c]) => `${r},${c}`));
  const horizontal = islands[a]!.r === islands[b]!.r;
  for (const k of bridges.keys()) {
    const [x, y] = k.split('-').map(Number) as [number, number];
    if (key(x, y) === key(a, b)) continue;
    if ((islands[x]!.r === islands[y]!.r) === horizontal) continue;
    if (between(islands[x]!, islands[y]!).some(([r, c]) => cells.has(`${r},${c}`))) return true;
  }
  return false;
}

export function solvedBridges(islands: Island[], bridges: Bridges): boolean {
  const count = islands.map(() => 0);
  for (const [k, v] of bridges) {
    const [a, b] = k.split('-').map(Number) as [number, number];
    count[a]! += v;
    count[b]! += v;
  }
  if (count.some((n, i) => n !== islands[i]!.need)) return false;
  const seen = new Set([0]);
  const stack = [0];
  while (stack.length) {
    const i = stack.pop()!;
    for (const k of bridges.keys()) {
      const [a, b] = k.split('-').map(Number) as [number, number];
      const other = a === i ? b : b === i ? a : -1;
      if (other >= 0 && !seen.has(other)) {
        seen.add(other);
        stack.push(other);
      }
    }
  }
  return seen.size === islands.length;
}
