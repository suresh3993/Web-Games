import type { TurnGame } from '../../kit/ai';

export interface RvState {
  board: number[]; // 0 empty, 1 dark (player), 2 light
  turn: 1 | 2;
  passes: number;
}

const DIRS = [-9, -8, -7, -1, 1, 7, 8, 9];

export function initial(): RvState {
  const board = Array(64).fill(0);
  board[27] = board[36] = 2;
  board[28] = board[35] = 1;
  return { board, turn: 1, passes: 0 };
}

/** Discs flipped by playing at `i` (empty if illegal). */
export function flips(board: number[], i: number, player: number): number[] {
  if (board[i]) return [];
  const out: number[] = [];
  for (const d of DIRS) {
    const line: number[] = [];
    let j = i + d;
    while (j >= 0 && j < 64 && Math.abs((j % 8) - ((j - d) % 8)) <= 1 && board[j] && board[j] !== player) {
      line.push(j);
      j += d;
    }
    if (line.length && j >= 0 && j < 64 && Math.abs((j % 8) - ((j - d) % 8)) <= 1 && board[j] === player) out.push(...line);
  }
  return out;
}

export const validMoves = (s: RvState) => [...Array(64).keys()].filter((i) => flips(s.board, i, s.turn).length > 0);

/** -1 represents a pass. */
export function play(s: RvState, move: number): RvState {
  if (move < 0) return { board: s.board, turn: s.turn === 1 ? 2 : 1, passes: s.passes + 1 };
  const board = [...s.board];
  board[move] = s.turn;
  for (const f of flips(s.board, move, s.turn)) board[f] = s.turn;
  return { board, turn: s.turn === 1 ? 2 : 1, passes: 0 };
}

export const isOver = (s: RvState) => s.passes >= 2 || s.board.every(Boolean) || (validMoves(s).length === 0 && validMoves({ ...s, turn: s.turn === 1 ? 2 : 1 }).length === 0);
export const count = (s: RvState, p: number) => s.board.filter((v) => v === p).length;

const WEIGHTS = [
  100, -20, 10, 5, 5, 10, -20, 100, -20, -50, -2, -2, -2, -2, -50, -20, 10, -2, -1, -1, -1, -1, -2, 10, 5, -2, -1, -1, -1, -1, -2, 5,
  5, -2, -1, -1, -1, -1, -2, 5, 10, -2, -1, -1, -1, -1, -2, 10, -20, -50, -2, -2, -2, -2, -50, -20, 100, -20, 10, 5, 5, 10, -20, 100,
];

export const REVERSI: TurnGame<RvState, number> = {
  moves: (s) => {
    if (isOver(s)) return [];
    const m = validMoves(s);
    return m.length ? m : [-1];
  },
  play,
  isOver,
  evaluate: (s) => {
    const me = s.turn;
    const them = me === 1 ? 2 : 1;
    if (isOver(s)) return Math.sign(count(s, me) - count(s, them)) * 10_000 + (count(s, me) - count(s, them));
    let pos = 0;
    s.board.forEach((v, i) => {
      if (v === me) pos += WEIGHTS[i]!;
      else if (v === them) pos -= WEIGHTS[i]!;
    });
    const mobility = validMoves(s).length - validMoves({ ...s, turn: them }).length;
    return pos + mobility * 5;
  },
};
