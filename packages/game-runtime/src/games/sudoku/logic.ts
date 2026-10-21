import { shuffle, type Rng } from '../../kit/util';

/** 81 cells, row-major, 0 = empty. */
export type Grid = number[];

const rowOf = (i: number) => Math.floor(i / 9);
const colOf = (i: number) => i % 9;
const boxOf = (i: number) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

/** Indices of the 20 cells sharing a row, column or box with each cell. */
export const PEERS: number[][] = Array.from({ length: 81 }, (_, i) => {
  const peers: number[] = [];
  for (let j = 0; j < 81; j++) if (j !== i && (rowOf(j) === rowOf(i) || colOf(j) === colOf(i) || boxOf(j) === boxOf(i))) peers.push(j);
  return peers;
});

export function candidates(grid: Grid, i: number): number[] {
  const used = new Set(PEERS[i]!.map((j) => grid[j]));
  return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => !used.has(d));
}

export const isValidPlacement = (grid: Grid, i: number, d: number) => PEERS[i]!.every((j) => grid[j] !== d);

/** Counts solutions up to `limit` (most-constrained-cell backtracking). */
export function countSolutions(grid: Grid, limit = 2): number {
  const g = [...grid];
  let count = 0;
  const search = (): boolean => {
    let best = -1;
    let bestCands: number[] = [];
    for (let i = 0; i < 81; i++) {
      if (g[i] !== 0) continue;
      const c = candidates(g, i);
      if (c.length === 0) return false;
      if (best === -1 || c.length < bestCands.length) {
        best = i;
        bestCands = c;
        if (c.length === 1) break;
      }
    }
    if (best === -1) {
      count++;
      return count >= limit;
    }
    for (const d of bestCands) {
      g[best] = d;
      if (search()) return true;
    }
    g[best] = 0;
    return false;
  };
  search();
  return count;
}

export function solvedGrid(random: Rng): Grid {
  const g: Grid = Array(81).fill(0);
  const fill = (i: number): boolean => {
    if (i === 81) return true;
    for (const d of shuffle(random, candidates(g, i))) {
      g[i] = d;
      if (fill(i + 1)) return true;
    }
    g[i] = 0;
    return false;
  };
  fill(0);
  return g;
}

/** Removes clues while keeping a unique solution, down to `targetClues` where possible. */
export function makePuzzle(random: Rng, targetClues: number): { puzzle: Grid; solution: Grid } {
  const solution = solvedGrid(random);
  const puzzle = [...solution];
  let clues = 81;
  for (const i of shuffle(random, [...Array(81).keys()])) {
    if (clues <= targetClues) break;
    const keep = puzzle[i]!;
    puzzle[i] = 0;
    if (countSolutions(puzzle, 2) !== 1) puzzle[i] = keep;
    else clues--;
  }
  return { puzzle, solution };
}

export const isComplete = (grid: Grid, solution: Grid) => grid.every((v, i) => v === solution[i]);

/** Cells whose value conflicts with a peer (for highlighting). */
export function conflicts(grid: Grid): Set<number> {
  const bad = new Set<number>();
  for (let i = 0; i < 81; i++) if (grid[i] && PEERS[i]!.some((j) => grid[j] === grid[i])) bad.add(i);
  return bad;
}
