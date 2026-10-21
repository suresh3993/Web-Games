import { describe, expect, it } from 'vitest';
import { apply, initial, legalMoves, winner, type CkState } from './logic';

const empty = (turn: 1 | 2 = 1): CkState => ({ board: Array(64).fill(0), turn, quiet: 0 });
const at = (r: number, c: number) => r * 8 + c;

describe('checkers rules', () => {
  it('has 7 opening moves for the first player', () => {
    expect(legalMoves(initial())).toHaveLength(7);
  });

  it('forces captures when available', () => {
    const s = empty();
    s.board[at(5, 2)] = 1;
    s.board[at(4, 3)] = 2;
    s.board[at(5, 6)] = 1;
    const moves = legalMoves(s);
    expect(moves.every((m) => m.captures.length === 1)).toBe(true);
    expect(moves[0]!.path).toEqual([at(5, 2), at(3, 4)]);
  });

  it('chains multi-jumps', () => {
    const s = empty();
    s.board[at(6, 1)] = 1;
    s.board[at(5, 2)] = 2;
    s.board[at(3, 4)] = 2;
    const [m] = legalMoves(s);
    expect(m!.captures).toHaveLength(2);
    expect(m!.path).toEqual([at(6, 1), at(4, 3), at(2, 5)]);
  });

  it('crowns men on the far row and kings move backwards', () => {
    const s = empty();
    s.board[at(1, 2)] = 1;
    const crowned = apply(s, { path: [at(1, 2), at(0, 1)], captures: [] });
    expect(crowned.board[at(0, 1)]).toBe(3);
    const back = { ...crowned, turn: 1 as const };
    expect(legalMoves(back).some((m) => m.path[1] === at(1, 0))).toBe(true);
  });

  it('a player with no moves loses', () => {
    const s = empty(2);
    s.board[at(5, 2)] = 1;
    expect(winner(s)).toBe(1);
  });
});
