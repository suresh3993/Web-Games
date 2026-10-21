import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/random';
import { conflicts, countSolutions, makePuzzle, PEERS, solvedGrid } from './logic';

const valid = (g: number[]) =>
  g.every((v, i) => v >= 1 && v <= 9 && PEERS[i]!.every((j) => g[j] !== v));

describe('sudoku logic', () => {
  it('each cell has 20 peers', () => {
    expect(PEERS.every((p) => p.length === 20)).toBe(true);
  });

  it('generates valid, deterministic solved grids', () => {
    const a = solvedGrid(createRng('s1'));
    expect(valid(a)).toBe(true);
    expect(solvedGrid(createRng('s1'))).toEqual(a);
    expect(solvedGrid(createRng('s2'))).not.toEqual(a);
  });

  it('puzzles have a unique solution matching the stored solution', () => {
    for (const [seed, clues] of [['p1', 40], ['p2', 30]] as const) {
      const { puzzle, solution } = makePuzzle(createRng(seed), clues);
      expect(puzzle.filter(Boolean).length).toBeLessThanOrEqual(clues + 6);
      expect(countSolutions(puzzle, 2)).toBe(1);
      puzzle.forEach((v, i) => v && expect(v).toBe(solution[i]));
      expect(valid(solution)).toBe(true);
    }
  });

  it('detects conflicts', () => {
    const g = Array(81).fill(0);
    g[0] = 5;
    g[8] = 5;
    expect([...conflicts(g)].sort((a, b) => a - b)).toEqual([0, 8]);
  });

  it('counts multiple solutions on an empty grid', () => {
    expect(countSolutions(Array(81).fill(0), 2)).toBe(2);
  });
});
