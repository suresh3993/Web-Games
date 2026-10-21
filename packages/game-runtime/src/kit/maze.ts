import { shuffle, type Rng } from './util';

/**
 * Perfect maze via iterative recursive-backtracker. walls[r][c] bitmask: 1=N, 2=E, 4=S, 8=W.
 */
export function generateMaze(rows: number, cols: number, random: Rng): number[][] {
  const walls = Array.from({ length: rows }, () => Array<number>(cols).fill(15));
  const seen = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
  const stack: [number, number][] = [[0, 0]];
  seen[0]![0] = true;
  const dirs: [number, number, number, number][] = [
    [-1, 0, 1, 4],
    [0, 1, 2, 8],
    [1, 0, 4, 1],
    [0, -1, 8, 2],
  ];
  while (stack.length) {
    const [r, c] = stack[stack.length - 1]!;
    const options = shuffle(random, dirs).filter(([dr, dc]) => {
      const nr = r + dr;
      const nc = c + dc;
      return nr >= 0 && nc >= 0 && nr < rows && nc < cols && !seen[nr]![nc];
    });
    if (!options.length) {
      stack.pop();
      continue;
    }
    const [dr, dc, wall, opposite] = options[0]!;
    const nr = r + dr;
    const nc = c + dc;
    walls[r]![c]! &= ~wall;
    walls[nr]![nc]! &= ~opposite;
    seen[nr]![nc] = true;
    stack.push([nr, nc]);
  }
  return walls;
}

export const WALL = { N: 1, E: 2, S: 4, W: 8 } as const;

/** Can you move from (r,c) in the given direction? */
export function open(walls: number[][], r: number, c: number, dir: 'N' | 'E' | 'S' | 'W') {
  return (walls[r]![c]! & WALL[dir]) === 0;
}

/** Breadth-first distance map from (r,c). */
export function distances(walls: number[][], r0: number, c0: number): number[][] {
  const rows = walls.length;
  const cols = walls[0]!.length;
  const d = Array.from({ length: rows }, () => Array<number>(cols).fill(-1));
  const q: [number, number][] = [[r0, c0]];
  d[r0]![c0] = 0;
  const moves: ['N' | 'E' | 'S' | 'W', number, number][] = [['N', -1, 0], ['E', 0, 1], ['S', 1, 0], ['W', 0, -1]];
  while (q.length) {
    const [r, c] = q.shift()!;
    for (const [dir, dr, dc] of moves) {
      if (!open(walls, r, c, dir)) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (d[nr]![nc] === -1) {
        d[nr]![nc] = d[r]![c]! + 1;
        q.push([nr, nc]);
      }
    }
  }
  return d;
}
