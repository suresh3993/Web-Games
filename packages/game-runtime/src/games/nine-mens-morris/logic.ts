import type { TurnGame } from '../../kit/ai';

/** 24 points: three concentric squares, 8 points each, numbered clockwise from top-left. */
export const ADJ: number[][] = [
  [1, 9], [0, 2, 4], [1, 14], [4, 10], [1, 3, 5, 7], [4, 13], [7, 11], [4, 6, 8], [7, 12],
  [0, 10, 21], [3, 9, 11, 18], [6, 10, 15], [8, 13, 17], [5, 12, 14, 20], [2, 13, 23],
  [11, 16], [15, 17, 19], [12, 16], [10, 19], [16, 18, 20, 22], [13, 19], [9, 22], [19, 21, 23], [14, 22],
];
export const MILLS: number[][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [12, 13, 14], [15, 16, 17], [18, 19, 20], [21, 22, 23],
  [0, 9, 21], [3, 10, 18], [6, 11, 15], [1, 4, 7], [16, 19, 22], [8, 12, 17], [5, 13, 20], [2, 14, 23],
];
/** Screen coordinates on a 7x7 grid for each point. */
export const COORDS: [number, number][] = [
  [0, 0], [0, 3], [0, 6], [1, 1], [1, 3], [1, 5], [2, 2], [2, 3], [2, 4], [3, 0], [3, 1], [3, 2],
  [3, 4], [3, 5], [3, 6], [4, 2], [4, 3], [4, 4], [5, 1], [5, 3], [5, 5], [6, 0], [6, 3], [6, 6],
];

export interface MorrisState {
  board: number[]; // 0 empty, 1, 2
  turn: 1 | 2;
  inHand: [number, number];
  plies: number;
}
export interface MorrisMove {
  from: number; // -1 when placing
  to: number;
  remove: number; // -1 if no mill formed
}

export const initial = (): MorrisState => ({ board: Array(24).fill(0), turn: 1, inHand: [9, 9], plies: 0 });
const onBoard = (s: MorrisState, p: number) => s.board.filter((v) => v === p).length;
export const inMill = (board: number[], i: number) => MILLS.some((m) => m.includes(i) && m.every((k) => board[k] === board[i]));
export const piecesLeft = (s: MorrisState, p: 1 | 2) => onBoard(s, p) + s.inHand[p - 1]!;

function removable(board: number[], opponent: number): number[] {
  const theirs = board.flatMap((v, i) => (v === opponent ? [i] : []));
  const loose = theirs.filter((i) => !inMill(board, i));
  return loose.length ? loose : theirs;
}

export function legalMoves(s: MorrisState): MorrisMove[] {
  const p = s.turn;
  const opp = p === 1 ? 2 : 1;
  const steps: { from: number; to: number }[] = [];
  if (s.inHand[p - 1]! > 0) {
    s.board.forEach((v, i) => !v && steps.push({ from: -1, to: i }));
  } else {
    const flying = onBoard(s, p) === 3;
    s.board.forEach((v, i) => {
      if (v !== p) return;
      const targets = flying ? s.board.flatMap((w, j) => (w ? [] : [j])) : ADJ[i]!.filter((j) => !s.board[j]);
      for (const to of targets) steps.push({ from: i, to });
    });
  }
  const moves: MorrisMove[] = [];
  for (const st of steps) {
    const b = [...s.board];
    if (st.from >= 0) b[st.from] = 0;
    b[st.to] = p;
    if (inMill(b, st.to)) for (const r of removable(b, opp)) moves.push({ ...st, remove: r });
    else moves.push({ ...st, remove: -1 });
  }
  return moves;
}

export function apply(s: MorrisState, m: MorrisMove): MorrisState {
  const board = [...s.board];
  const inHand: [number, number] = [...s.inHand];
  if (m.from >= 0) board[m.from] = 0;
  else inHand[s.turn - 1]!--;
  board[m.to] = s.turn;
  if (m.remove >= 0) board[m.remove] = 0;
  return { board, turn: s.turn === 1 ? 2 : 1, inHand, plies: s.plies + 1 };
}

/** Winner: opponent reduced below 3 pieces, or the side to move cannot move. */
export function winner(s: MorrisState): 0 | 1 | 2 | 'draw' {
  if (piecesLeft(s, 1) < 3) return 2;
  if (piecesLeft(s, 2) < 3) return 1;
  if (s.plies >= 200) return 'draw';
  if (legalMoves(s).length === 0) return s.turn === 1 ? 2 : 1;
  return 0;
}

export const MORRIS: TurnGame<MorrisState, MorrisMove> = {
  moves: (s) => (winner(s) ? [] : legalMoves(s)),
  play: apply,
  isOver: (s) => winner(s) !== 0,
  evaluate: (s) => {
    const w = winner(s);
    if (w === 'draw') return 0;
    if (w) return w === s.turn ? 10_000 - s.plies : -10_000 + s.plies;
    const me = s.turn;
    const them = me === 1 ? 2 : 1;
    const mills = (p: number) => MILLS.filter((m) => m.every((k) => s.board[k] === p)).length;
    const twos = (p: number) => MILLS.filter((m) => m.filter((k) => s.board[k] === p).length === 2 && m.some((k) => !s.board[k])).length;
    return (piecesLeft(s, me) - piecesLeft(s, them)) * 100 + (mills(me) - mills(them)) * 20 + (twos(me) - twos(them)) * 8;
  },
};
