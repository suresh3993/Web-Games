import { describe, expect, it } from 'vitest';
import { applyMove, initial, legalSequences, pipCount, singleMoves, type BgState } from './logic';

const empty = (): BgState => ({ points: Array(24).fill(0), bar: [0, 0], off: [0, 0] });

describe('backgammon rules', () => {
  it('starts with 15 checkers each and 167 pips', () => {
    const s = initial();
    expect(s.points.filter((v) => v > 0).reduce((a, b) => a + b, 0)).toBe(15);
    expect(-s.points.filter((v) => v < 0).reduce((a, b) => a + b, 0)).toBe(15);
    expect(pipCount(s, 0)).toBe(167);
    expect(pipCount(s, 1)).toBe(167);
  });

  it('cannot land on a point held by two or more opponents', () => {
    const s = initial();
    // Player 0 from 12 with a 1 → 11 (held by 5 opponents): blocked
    expect(singleMoves(s, 0, 1).some((m) => m.from === 12 && m.to === 11)).toBe(false);
  });

  it('hitting a blot sends it to the bar, which must re-enter first', () => {
    const s = empty();
    s.points[10] = 1;
    s.points[7] = -1;
    s.points[20] = -1;
    const hit = applyMove(s, 0, { from: 10, to: 7, die: 3, hit: true });
    expect(hit.bar[1]).toBe(1);
    expect(singleMoves(hit, 1, 3).every((m) => m.from === 'bar')).toBe(true);
  });

  it('doubles allow four moves', () => {
    const s = initial();
    const seqs = legalSequences(s, 0, [3, 3]);
    expect(seqs.every((q) => q.moves.length === 4)).toBe(true);
  });

  it('must use the higher die when only one can be played', () => {
    // A lone checker on 20: 20→19 (die 1) and 20→14 (die 6) are each legal, but
    // both continuations land on 13, which is blocked — so only one die can be used.
    const s = empty();
    s.points[20] = 1;
    s.points[13] = -2;
    const seqs = legalSequences(s, 0, [1, 6]);
    expect(seqs.length).toBe(1);
    expect(seqs[0]!.moves).toHaveLength(1);
    expect(seqs[0]!.moves[0]!.die).toBe(6);
  });

  it('bears off only when all checkers are home, and with a higher die from the furthest point', () => {
    const s = empty();
    s.points[2] = 2;
    s.points[10] = 1;
    expect(singleMoves(s, 0, 3).some((m) => m.to === 'off')).toBe(false);
    s.points[10] = 0;
    s.points[1] = 1;
    expect(singleMoves(s, 0, 3).some((m) => m.from === 2 && m.to === 'off')).toBe(true);
    expect(singleMoves(s, 0, 6).filter((m) => m.to === 'off').map((m) => m.from)).toEqual([2]);
  });
});
