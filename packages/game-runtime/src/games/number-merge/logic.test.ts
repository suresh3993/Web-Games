import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/random';
import { canMove, move, slideLine, spawn } from './logic';

describe('number merge', () => {
  it('slides and merges each pair only once', () => {
    expect(slideLine([2, 2, 2, 2])).toEqual({ line: [4, 4, 0, 0], gained: 8 });
    expect(slideLine([2, 0, 2, 4])).toEqual({ line: [4, 4, 0, 0], gained: 4 });
    expect(slideLine([4, 4, 8, 0])).toEqual({ line: [8, 8, 0, 0], gained: 8 });
    expect(slideLine([0, 0, 0, 2])).toEqual({ line: [2, 0, 0, 0], gained: 0 });
  });

  it('moves in all four directions', () => {
    const b = [2, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0];
    expect(move(b, 4, 'left').board.slice(0, 4)).toEqual([4, 0, 0, 0]);
    expect(move(b, 4, 'right').board.slice(0, 4)).toEqual([0, 0, 0, 4]);
    expect(move(b, 4, 'down').board[12]).toBe(4);
    expect(move(b, 4, 'up').board[0]).toBe(4);
  });

  it('reports no movement and detects game over', () => {
    const stuck = [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2];
    expect(move(stuck, 4, 'left').moved).toBe(false);
    expect(canMove(stuck, 4)).toBe(false);
  });

  it('spawns a 2 or 4 into an empty cell', () => {
    const next = spawn(Array(16).fill(0), createRng('n'));
    expect(next.filter(Boolean)).toHaveLength(1);
    expect([2, 4]).toContain(next.find(Boolean));
  });
});
