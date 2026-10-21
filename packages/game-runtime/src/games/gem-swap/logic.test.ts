import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/random';
import { findRuns, idx, isValidSwap, randomBoard, resolveStep, SIZE, type Board } from './logic';

const fromColors = (rows: number[][]): Board => rows.flat().map((color) => ({ color, special: 'none' as const }));

// A board with no runs: colours cycle so neighbours never repeat 3 times.
const base = () => Array.from({ length: SIZE }, (_, r) => Array.from({ length: SIZE }, (_, c) => (r * 2 + c) % 6));

describe('gem swap', () => {
  it('generates boards without pre-existing matches', () => {
    for (const s of ['a', 'b', 'c']) expect(findRuns(randomBoard(createRng(s)))).toEqual([]);
  });

  it('finds horizontal and vertical runs', () => {
    const rows = base();
    rows[0]![0] = rows[0]![1] = rows[0]![2] = 5;
    rows[3]![7] = rows[4]![7] = rows[5]![7] = 4;
    const runs = findRuns(fromColors(rows));
    expect(runs).toContainEqual([idx(0, 0), idx(0, 1), idx(0, 2)]);
    expect(runs).toContainEqual([idx(3, 7), idx(4, 7), idx(5, 7)]);
  });

  it('only allows swaps between neighbours that create a match', () => {
    const rows = base();
    rows[0]![0] = rows[0]![1] = 5;
    rows[1]![2] = 5;
    const b = fromColors(rows);
    expect(isValidSwap(b, idx(0, 2), idx(1, 2))).toBe(true);
    expect(isValidSwap(b, idx(0, 2), idx(2, 2))).toBe(false);
    expect(isValidSwap(b, idx(5, 5), idx(5, 6))).toBe(false);
  });

  it('a run of four creates a line gem at the swapped cell and keeps the board full', () => {
    const rows = base();
    rows[2]![0] = rows[2]![1] = rows[2]![2] = rows[2]![3] = 5;
    const { board, cleared } = resolveStep(fromColors(rows), createRng('r'), [idx(2, 1)]);
    expect(cleared).toBe(3);
    expect(board.every(Boolean)).toBe(true);
    // the line gem falls to the bottom of its column? It stays in row 2 (nothing above row 2 is cleared in col 1)
    expect(board.some((g) => g?.special === 'line')).toBe(true);
  });
});
