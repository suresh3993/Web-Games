import type { TurnGame } from '../../kit/ai';

/**
 * American checkers on the dark squares of an 8x8 board.
 * Cells: 0 empty, 1 player-1 man, 2 player-2 man, 3 player-1 king, 4 player-2 king.
 * Player 1 starts at the bottom (rows 5–7) and moves up.
 */
export interface CkState {
  board: number[];
  turn: 1 | 2;
  quiet: number; // moves since the last capture (draw at 80 plies)
}
export interface CkMove {
  path: number[]; // squares visited, path[0] = start
  captures: number[];
}

export const owner = (v: number) => (v === 0 ? 0 : v % 2 === 1 ? 1 : 2);
export const isKing = (v: number) => v >= 3;

export function initial(): CkState {
  const board = Array(64).fill(0);
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 0) continue;
      if (r < 3) board[r * 8 + c] = 2;
      if (r > 4) board[r * 8 + c] = 1;
    }
  return { board, turn: 1, quiet: 0 };
}

function dirsFor(v: number): [number, number][] {
  if (isKing(v)) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  return owner(v) === 1 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
}

const kingRow = (player: number) => (player === 1 ? 0 : 7);

function jumpsFrom(board: number[], from: number, piece: number): CkMove[] {
  const results: CkMove[] = [];
  const walk = (at: number, b: number[], path: number[], caps: number[]) => {
    let extended = false;
    const r = Math.floor(at / 8);
    const c = at % 8;
    for (const [dr, dc] of dirsFor(piece)) {
      const mr = r + dr;
      const mc = c + dc;
      const lr = r + 2 * dr;
      const lc = c + 2 * dc;
      if (lr < 0 || lr > 7 || lc < 0 || lc > 7) continue;
      const mid = mr * 8 + mc;
      const land = lr * 8 + lc;
      if (owner(b[mid]!) === 0 || owner(b[mid]!) === owner(piece) || b[land] !== 0) continue;
      const nb = [...b];
      nb[mid] = 0;
      nb[at] = 0;
      nb[land] = piece;
      extended = true;
      // A man reaching the king row by jumping ends its turn there.
      if (!isKing(piece) && lr === kingRow(owner(piece))) results.push({ path: [...path, land], captures: [...caps, mid] });
      else walk(land, nb, [...path, land], [...caps, mid]);
    }
    if (!extended && caps.length) results.push({ path, captures: caps });
  };
  walk(from, board, [from], []);
  return results;
}

export function legalMoves(s: CkState): CkMove[] {
  const jumps: CkMove[] = [];
  const steps: CkMove[] = [];
  for (let i = 0; i < 64; i++) {
    const v = s.board[i]!;
    if (owner(v) !== s.turn) continue;
    jumps.push(...jumpsFrom(s.board, i, v));
    if (jumps.length) continue;
    const r = Math.floor(i / 8);
    const c = i % 8;
    for (const [dr, dc] of dirsFor(v)) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && s.board[nr * 8 + nc] === 0) steps.push({ path: [i, nr * 8 + nc], captures: [] });
    }
  }
  return jumps.length ? jumps : steps;
}

export function apply(s: CkState, m: CkMove): CkState {
  const board = [...s.board];
  let piece = board[m.path[0]!]!;
  board[m.path[0]!] = 0;
  for (const cap of m.captures) board[cap] = 0;
  const end = m.path[m.path.length - 1]!;
  if (!isKing(piece) && Math.floor(end / 8) === kingRow(owner(piece))) piece += 2;
  board[end] = piece;
  return { board, turn: s.turn === 1 ? 2 : 1, quiet: m.captures.length ? 0 : s.quiet + 1 };
}

export function winner(s: CkState): 0 | 1 | 2 | 'draw' | null {
  if (s.quiet >= 80) return 'draw';
  if (legalMoves(s).length === 0) return s.turn === 1 ? 2 : 1;
  return null;
}

export const CHECKERS: TurnGame<CkState, CkMove> = {
  moves: (s) => (s.quiet >= 80 ? [] : legalMoves(s)),
  play: apply,
  isOver: (s) => winner(s) !== null,
  evaluate: (s) => {
    const w = winner(s);
    if (w === 'draw') return 0;
    if (w) return w === s.turn ? 100_000 : -100_000;
    let score = 0;
    s.board.forEach((v, i) => {
      if (!v) return;
      const r = Math.floor(i / 8);
      const advance = owner(v) === 1 ? 7 - r : r;
      const val = (isKing(v) ? 175 : 100 + advance * 3) + (i % 8 > 1 && i % 8 < 6 ? 4 : 0);
      score += owner(v) === s.turn ? val : -val;
    });
    return score;
  },
};
