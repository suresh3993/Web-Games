import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/random';
import { blankBoard, chord, generate, isWon, reveal, toggleFlag } from './logic';

describe('minesweeper logic', () => {
  it('places exactly N mines and never on or around the first click', () => {
    for (const seed of ['a', 'b', 'c', 'd']) {
      const b = blankBoard(9, 9, 10);
      generate(b, 4, 4, createRng(seed));
      expect(b.cells.flat().filter((c) => c.mine)).toHaveLength(10);
      for (let r = 3; r <= 5; r++) for (let c = 3; c <= 5; c++) expect(b.cells[r]![c]!.mine).toBe(false);
    }
  });

  it('first reveal opens a region (cell has 0 adjacent mines)', () => {
    const b = blankBoard(9, 9, 10);
    const opened = reveal(b, 4, 4, createRng('x'));
    expect(opened).toBeGreaterThan(1);
    expect(b.cells[4]![4]!.adjacent).toBe(0);
  });

  it('computes adjacency counts correctly', () => {
    const b = blankBoard(3, 3, 0);
    b.cells[0]![0]!.mine = true;
    b.cells[2]![2]!.mine = true;
    b.generated = true;
    // recompute via generate with zero extra mines
    generate(b, 1, 1, createRng('y'));
    expect(b.cells[1]![1]!.adjacent).toBe(2);
    expect(b.cells[0]![1]!.adjacent).toBe(1);
  });

  it('hitting a mine explodes; flagged cells cannot be revealed', () => {
    const b = blankBoard(3, 3, 0);
    b.generated = true;
    b.cells[0]![0]!.mine = true;
    toggleFlag(b, 0, 0);
    expect(reveal(b, 0, 0, createRng('z'))).toBe(0);
    expect(b.exploded).toBe(false);
    toggleFlag(b, 0, 0);
    reveal(b, 0, 0, createRng('z'));
    expect(b.exploded).toBe(true);
  });

  it('chording reveals neighbours when flags match the number, and detects a win', () => {
    const b = blankBoard(2, 2, 1);
    b.generated = true;
    b.cells[0]![0]!.mine = true;
    for (const [r, c] of [[0, 1], [1, 0], [1, 1]] as const) b.cells[r]![c]!.adjacent = 1;
    reveal(b, 1, 1, createRng('w'));
    expect(chord(b, 1, 1, createRng('w'))).toBe(0); // no flag yet
    toggleFlag(b, 0, 0);
    expect(chord(b, 1, 1, createRng('w'))).toBe(2);
    expect(isWon(b)).toBe(true);
  });
});
