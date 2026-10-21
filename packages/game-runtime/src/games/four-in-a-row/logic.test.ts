import { describe, expect, it } from 'vitest';
import { bestMove } from '../../kit/ai';
import { createRng } from '../../core/random';
import { TTT, winnerOf } from '../tic-tac-toe/index';
import { C4, COLS, initial, winLine } from './logic';

const playAll = (cols: number[]) => cols.reduce((s, c) => C4.play(s, c), initial());

describe('four in a row', () => {
  it('detects horizontal, vertical and diagonal wins', () => {
    // vertical: player 1 plays column 0 four times
    const v = playAll([0, 1, 0, 1, 0, 1, 0]);
    expect(winLine(v.board, v.last)).toHaveLength(4);
    const h = playAll([0, 0, 1, 1, 2, 2, 3]);
    expect(winLine(h.board, h.last)).not.toBeNull();
    const d = playAll([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]);
    expect(winLine(d.board, d.last)).not.toBeNull();
    expect(winLine(playAll([0, 1, 2]).board, 2 + 5 * COLS)).toBeNull();
  });

  it('the computer takes an immediate win and blocks an immediate loss', () => {
    // Player 2 (computer) to move with three in column 6 already.
    const winning = playAll([0, 6, 1, 6, 0, 6, 5]);
    expect(winning.turn).toBe(2);
    expect(bestMove(C4, winning, 4, createRng('a'))).toBe(6);
    // Player 1 threatens column 0 → computer must block.
    const threat = playAll([0, 6, 0, 5, 0]);
    expect(bestMove(C4, threat, 4, createRng('b'))).toBe(0);
  });
});

describe('tic-tac-toe AI', () => {
  it('perfect play from the empty board never loses (self-play draws)', () => {
    let s = { board: Array(9).fill(0), turn: 1 as 1 | 2 };
    const rnd = createRng('ttt');
    while (!TTT.isOver(s)) s = TTT.play(s, bestMove(TTT, s, 9, rnd)!);
    expect(winnerOf(s.board)).toBeNull();
  });

  it('wins when it can', () => {
    const s = { board: [2, 2, 0, 1, 1, 0, 0, 0, 0], turn: 2 as 1 | 2 };
    expect(bestMove(TTT, s, 9, createRng('w'))).toBe(2);
  });
});
