import type { TurnGame } from '../../kit/ai';

export const COLS = 7;
export const ROWS = 6;

export interface C4State {
  /** Column-major heights are derived; board[r*COLS+c], row 0 = top. */
  board: number[];
  turn: 1 | 2;
  last: number;
}

export const initial = (): C4State => ({ board: Array(ROWS * COLS).fill(0), turn: 1, last: -1 });

export function dropRow(board: number[], col: number): number {
  for (let r = ROWS - 1; r >= 0; r--) if (!board[r * COLS + col]) return r;
  return -1;
}

const DIRS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

/** Returns the winning cells if the piece at `index` completes four in a row. */
export function winLine(board: number[], index: number): number[] | null {
  if (index < 0) return null;
  const p = board[index];
  if (!p) return null;
  const r0 = Math.floor(index / COLS);
  const c0 = index % COLS;
  for (const [dr, dc] of DIRS) {
    const line = [index];
    for (const sign of [1, -1]) {
      let r = r0 + dr! * sign;
      let c = c0 + dc! * sign;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r * COLS + c] === p) {
        line.push(r * COLS + c);
        r += dr! * sign;
        c += dc! * sign;
      }
    }
    if (line.length >= 4) return line;
  }
  return null;
}

function windowScore(cells: number[], me: number): number {
  const mine = cells.filter((v) => v === me).length;
  const theirs = cells.filter((v) => v && v !== me).length;
  if (mine && theirs) return 0;
  if (mine === 3) return 50;
  if (mine === 2) return 10;
  if (theirs === 3) return -80;
  if (theirs === 2) return -10;
  return 0;
}

function heuristic(board: number[], me: number): number {
  let score = 0;
  for (let r = 0; r < ROWS; r++) if (board[r * COLS + 3] === me) score += 6;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      for (const [dr, dc] of DIRS) {
        const er = r + dr! * 3;
        const ec = c + dc! * 3;
        if (er < 0 || er >= ROWS || ec < 0 || ec >= COLS) continue;
        score += windowScore([0, 1, 2, 3].map((k) => board[(r + dr! * k) * COLS + (c + dc! * k)]!), me);
      }
  return score;
}

const ORDER = [3, 2, 4, 1, 5, 0, 6];

export const C4: TurnGame<C4State, number> = {
  moves: (s) => (winLine(s.board, s.last) ? [] : ORDER.filter((c) => dropRow(s.board, c) >= 0)),
  play: (s, col) => {
    const r = dropRow(s.board, col);
    const board = [...s.board];
    board[r * COLS + col] = s.turn;
    return { board, turn: s.turn === 1 ? 2 : 1, last: r * COLS + col };
  },
  isOver: (s) => !!winLine(s.board, s.last) || s.board.every(Boolean),
  evaluate: (s) => {
    if (winLine(s.board, s.last)) {
      // The previous mover won → bad for the player to move. Faster wins score higher.
      return -(100_000 + s.board.filter((v) => !v).length);
    }
    return heuristic(s.board, s.turn);
  },
};
