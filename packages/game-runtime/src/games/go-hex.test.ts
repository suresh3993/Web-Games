import { describe, expect, it } from 'vitest';
import { distanceToConnect, N as HN, winningChain } from './hex/index';
import { initial, N, play, score } from './go-9x9/logic';

const at = (r: number, c: number) => r * N + c;

describe('go 9x9', () => {
  it('captures a surrounded stone', () => {
    let s = initial();
    // Black surrounds white at (1,1)
    for (const [b, w] of [[at(0, 1), at(1, 1)], [at(1, 0), at(5, 5)], [at(1, 2), at(6, 6)]] as const) {
      s = play(s, b)!;
      s = play(s, w)!;
    }
    s = play(s, at(2, 1))!;
    expect(s.board[at(1, 1)]).toBe(0);
    expect(s.captures[0]).toBe(1);
  });

  it('forbids suicide', () => {
    let s = initial();
    s = play(s, at(0, 1))!; // B
    s = play(s, at(8, 8))!; // W
    s = play(s, at(1, 0))!; // B
    expect(play(s, at(0, 0))).toBeNull(); // W suicide in the corner
  });

  it('two passes end the game; empty board scores komi to White', () => {
    let s = initial();
    s = play(s, -1)!;
    s = play(s, -1)!;
    expect(s.passes).toBe(2);
    expect(score(s.board).white).toBe(6.5);
  });

  it('counts territory surrounded by one colour', () => {
    const board = Array(N * N).fill(0);
    for (let r = 0; r < N; r++) {
      board[at(r, 1)] = 1; // black wall on column 1
      board[at(r, 3)] = 2; // white wall on column 3
    }
    const { black, white } = score(board);
    expect(black).toBe(N * 2); // black wall + column 0 (column 2 touches both colours: neutral)
    expect(white).toBe(N * 6 + 6.5); // white wall + columns 4–8 + komi
  });
});

describe('hex', () => {
  it('detects a straight top-to-bottom chain and measures connection distance', () => {
    const board = Array(HN * HN).fill(0);
    for (let r = 0; r < HN; r++) board[r * HN + 4] = 1;
    expect(winningChain(board, 1)).toHaveLength(HN);
    expect(winningChain(board, 2)).toBeNull();
    expect(distanceToConnect(board, 1)).toBe(0);
    expect(distanceToConnect(Array(HN * HN).fill(0), 2)).toBe(HN);
  });
});
