import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/random';
import { chooseMove, fromFen, initialState, legalMoves, makeMove, outcome, sq, type ChessState } from './logic';

/** Counts leaf nodes (standard move-generator correctness check). */
function perft(s: ChessState, depth: number): number {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of legalMoves(s)) n += perft(makeMove(s, m), depth - 1);
  return n;
}

const move = (s: ChessState, from: string, to: string, promo?: 'q' | 'n') => {
  const m = legalMoves(s).find((x) => x.from === sq(from) && x.to === sq(to) && (!promo || x.promo === promo));
  if (!m) throw new Error(`illegal ${from}${to}`);
  return makeMove(s, m);
};

describe('chess rules', () => {
  it('perft from the initial position matches known values', () => {
    const s = initialState();
    expect(perft(s, 1)).toBe(20);
    expect(perft(s, 2)).toBe(400);
    expect(perft(s, 3)).toBe(8902);
  });

  it('perft on "Kiwipete" (castling, en passant, promotions) matches known values', () => {
    const s = fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -');
    expect(perft(s, 1)).toBe(48);
    expect(perft(s, 2)).toBe(2039);
  });

  it('detects fool’s mate', () => {
    let s = initialState();
    s = move(s, 'f2', 'f3');
    s = move(s, 'e7', 'e5');
    s = move(s, 'g2', 'g4');
    s = move(s, 'd8', 'h4');
    expect(outcome(s)).toEqual({ result: 'checkmate', winner: 'b' });
  });

  it('handles en passant', () => {
    let s = initialState();
    s = move(s, 'e2', 'e4');
    s = move(s, 'a7', 'a6');
    s = move(s, 'e4', 'e5');
    s = move(s, 'd7', 'd5');
    s = move(s, 'e5', 'd6');
    expect(s.board[sq('d5')]).toBeNull();
    expect(s.board[sq('d6')]).toEqual({ type: 'p', color: 'w' });
  });

  it('castles and moves the rook; loses rights after the king moves', () => {
    const s = fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq -');
    const castled = move(s, 'e1', 'g1');
    expect(castled.board[sq('f1')]).toEqual({ type: 'r', color: 'w' });
    expect(castled.castling.wk).toBe(false);
    expect(castled.castling.wq).toBe(false);
  });

  it('cannot castle through check', () => {
    const s = fromFen('4k3/8/8/8/8/8/5r2/R3K2R w KQ -');
    expect(legalMoves(s).some((m) => m.castle && m.to === sq('g1'))).toBe(false);
  });

  it('promotes to the chosen piece', () => {
    const s = fromFen('8/P6k/8/8/8/8/8/K7 w - -');
    expect(move(s, 'a7', 'a8', 'n').board[sq('a8')]).toEqual({ type: 'n', color: 'w' });
  });

  it('detects stalemate and insufficient material', () => {
    expect(outcome(fromFen('7k/5Q2/6K1/8/8/8/8/8 b - -'))).toEqual({ result: 'stalemate' });
    expect(outcome(fromFen('7k/8/6K1/8/8/8/8/8 w - -'))).toEqual({ result: 'insufficient' });
  });

  it('the engine finds mate in one', () => {
    const s = fromFen('6k1/5ppp/8/8/8/8/8/R5K1 w - -');
    const m = chooseMove(s, 2, createRng('m'));
    expect(m && makeMove(s, m) && outcome(makeMove(s, m!))).toEqual({ result: 'checkmate', winner: 'w' });
  });

  it('the engine captures a hanging queen', () => {
    const s = fromFen('4k3/8/8/3q4/4P3/8/8/4K3 w - -');
    const m = chooseMove(s, 2, createRng('q'))!;
    expect([m.from, m.to]).toEqual([sq('e4'), sq('d5')]);
  });
});
