import { describe, expect, it } from 'vitest';
import { createRng } from '../core/random';
import { bestMove } from '../kit/ai';
import { aiLine, completes } from './dots-and-boxes/index';
import { aiMove, lineAt } from './gomoku/index';
import { bestPit, initial as kalah, isOver as kalahOver, sow, STORE } from './mancala/logic';
import { ADJ, apply as morrisApply, initial as morrisInitial, legalMoves as morrisMoves, MILLS } from './nine-mens-morris/logic';
import { anyMoves, crossBoard, jumps } from './peg-solitaire/index';
import { flips, initial as reversiInitial, play as reversiPlay, REVERSI, validMoves } from './reversi/logic';

describe('reversi', () => {
  it('has 4 opening moves and flips correctly', () => {
    const s = reversiInitial();
    expect(validMoves(s).sort((a, b) => a - b)).toEqual([19, 26, 37, 44]);
    expect(flips(s.board, 19, 1)).toEqual([27]);
    const next = reversiPlay(s, 19);
    expect(next.board[27]).toBe(1);
    expect(next.turn).toBe(2);
  });

  it('the computer prefers a corner when available', () => {
    const board = Array(64).fill(0);
    board[9] = 2;
    board[18] = 1;
    board[1] = 1;
    // Extra pieces so the game continues after Dark's move (otherwise every move wins outright).
    board[60] = 2;
    board[52] = 1;
    const s = { board, turn: 1 as const, passes: 0 };
    // Dark can play the a1-corner (index 0) by flipping 9.
    expect(flips(board, 0, 1)).toEqual([9]);
    // Depth 1 isolates the positional heuristic (deeper, both moves force the same won ending).
    expect(bestMove(REVERSI, s, 1, createRng('c'))).toBe(0);
  });
});

describe('gomoku', () => {
  it('detects five in a row and blocks an open four', () => {
    const N = 15;
    const b = Array(N * N).fill(0);
    for (let c = 0; c < 5; c++) b[7 * N + c] = 1;
    expect(lineAt(b, 7 * N + 4, 1).length).toBe(5);
    const threat = Array(N * N).fill(0);
    for (let c = 3; c < 7; c++) threat[7 * N + c] = 1;
    const block = aiMove(threat, 2, createRng('g'), 0.95, 0);
    expect([7 * N + 2, 7 * N + 7]).toContain(block);
  });
});

describe('dots and boxes', () => {
  it('takes a completing line and recognises completions', () => {
    const lines = Array(40).fill(false);
    // Draw three sides of the top-left box: h(0,0)=0, h(1,0)=4, v(0,0)=20
    lines[0] = lines[4] = lines[20] = true;
    expect(completes(lines, 21)).toBe(1);
    expect(aiLine(lines, createRng('d'), 'hard')).toBe(21);
  });
});

describe('mancala (kalah)', () => {
  it('sowing from pit 2 ends in the store and grants another turn', () => {
    const s = sow(kalah(), 2);
    expect(s.pits[STORE[1]]).toBe(1);
    expect(s.turn).toBe(1);
  });

  it('captures opposite seeds when landing in an own empty pit', () => {
    // Last seed lands in empty pit 3; the opposite pit (12 - 3 = 9) holds 5 seeds.
    const s = { pits: [0, 0, 1, 0, 0, 0, 0, 0, 0, 5, 0, 0, 1, 0], turn: 1 as const };
    const next = sow(s, 2);
    expect(next.pits[3]).toBe(0);
    expect(next.pits[9]).toBe(0);
    expect(next.pits[STORE[1]]).toBe(6);
  });

  it('a full game between two computers terminates with all 48 seeds in stores', () => {
    let s = kalah();
    const rnd = createRng('k');
    let guard = 0;
    while (!kalahOver(s) && guard++ < 500) s = sow(s, bestPit(s, 2, rnd));
    expect(kalahOver(s)).toBe(true);
    expect(s.pits[STORE[1]]! + s.pits[STORE[2]]!).toBe(48);
  });
});

describe("nine men's morris", () => {
  it('has a symmetric adjacency graph and 16 mills', () => {
    ADJ.forEach((ns, i) => ns.forEach((j) => expect(ADJ[j]).toContain(i)));
    expect(MILLS).toHaveLength(16);
  });

  it('forming a mill requires a removal', () => {
    let s = morrisInitial();
    s = morrisApply(s, { from: -1, to: 0, remove: -1 });
    s = morrisApply(s, { from: -1, to: 21, remove: -1 });
    s = morrisApply(s, { from: -1, to: 1, remove: -1 });
    s = morrisApply(s, { from: -1, to: 22, remove: -1 });
    const millMoves = morrisMoves(s).filter((m) => m.to === 2);
    expect(millMoves.length).toBeGreaterThan(0);
    expect(millMoves.every((m) => m.remove >= 0)).toBe(true);
  });
});

describe('peg solitaire', () => {
  it('starts with 32 pegs and 4 opening jumps', () => {
    const b = crossBoard();
    expect(b.filter((v) => v === 1)).toHaveLength(32);
    const opening = b.flatMap((v, i) => jumps(b, i));
    expect(opening).toHaveLength(4);
    expect(anyMoves(b)).toBe(true);
  });
});
