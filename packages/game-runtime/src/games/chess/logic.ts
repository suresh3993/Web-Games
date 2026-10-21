/**
 * Chess rules (original implementation): legal move generation including castling,
 * en passant and promotion; check, checkmate, stalemate, 50-move and
 * insufficient-material draws. Board index 0 = a8 … 63 = h1.
 */
export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export interface Piece {
  type: PieceType;
  color: Color;
}
export interface Move {
  from: number;
  to: number;
  promo?: PieceType;
  /** Set during generation for display / ordering. */
  capture?: boolean;
  castle?: boolean;
  enPassant?: boolean;
}
export interface ChessState {
  board: (Piece | null)[];
  turn: Color;
  castling: { wk: boolean; wq: boolean; bk: boolean; bq: boolean };
  ep: number; // en-passant target square or -1
  halfmove: number;
  fullmove: number;
}

const FILES = 'abcdefgh';
export const sq = (name: string) => FILES.indexOf(name[0]!) + (8 - Number(name[1])) * 8;
export const sqName = (i: number) => `${FILES[i % 8]}${8 - Math.floor(i / 8)}`;
const rowOf = (i: number) => Math.floor(i / 8);
const colOf = (i: number) => i % 8;
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

export function initialState(): ChessState {
  const back: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  const board: (Piece | null)[] = Array(64).fill(null);
  for (let c = 0; c < 8; c++) {
    board[c] = { type: back[c]!, color: 'b' };
    board[8 + c] = { type: 'p', color: 'b' };
    board[48 + c] = { type: 'p', color: 'w' };
    board[56 + c] = { type: back[c]!, color: 'w' };
  }
  return { board, turn: 'w', castling: { wk: true, wq: true, bk: true, bq: true }, ep: -1, halfmove: 0, fullmove: 1 };
}

/** Parses the piece-placement and side-to-move fields of a FEN (tests / puzzles). */
export function fromFen(fen: string): ChessState {
  const [placement, turn = 'w', castle = '-', ep = '-'] = fen.split(' ');
  const board: (Piece | null)[] = [];
  for (const ch of placement!.replace(/\//g, '')) {
    if (/\d/.test(ch)) for (let k = 0; k < Number(ch); k++) board.push(null);
    else board.push({ type: ch.toLowerCase() as PieceType, color: ch === ch.toUpperCase() ? 'w' : 'b' });
  }
  return {
    board,
    turn: turn as Color,
    castling: { wk: castle.includes('K'), wq: castle.includes('Q'), bk: castle.includes('k'), bq: castle.includes('q') },
    ep: ep === '-' ? -1 : sq(ep),
    halfmove: 0,
    fullmove: 1,
  };
}

const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

/** Is square `target` attacked by any piece of colour `by`? */
export function attacked(board: (Piece | null)[], target: number, by: Color): boolean {
  const tr = rowOf(target);
  const tc = colOf(target);
  // Pawns
  const pr = by === 'w' ? tr + 1 : tr - 1;
  for (const dc of [-1, 1]) {
    const c = tc + dc;
    if (pr >= 0 && pr < 8 && c >= 0 && c < 8) {
      const p = board[pr * 8 + c];
      if (p && p.color === by && p.type === 'p') return true;
    }
  }
  for (const [dr, dc] of KNIGHT) {
    const r = tr + dr!;
    const c = tc + dc!;
    if (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const p = board[r * 8 + c];
      if (p && p.color === by && p.type === 'n') return true;
    }
  }
  for (const [dr, dc] of KING) {
    const r = tr + dr!;
    const c = tc + dc!;
    if (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const p = board[r * 8 + c];
      if (p && p.color === by && p.type === 'k') return true;
    }
  }
  const slide = (dirs: number[][], types: PieceType[]) => {
    for (const [dr, dc] of dirs) {
      let r = tr + dr!;
      let c = tc + dc!;
      while (r >= 0 && r < 8 && c >= 0 && c < 8) {
        const p = board[r * 8 + c];
        if (p) {
          if (p.color === by && types.includes(p.type)) return true;
          break;
        }
        r += dr!;
        c += dc!;
      }
    }
    return false;
  };
  return slide(ROOK_DIRS, ['r', 'q']) || slide(BISHOP_DIRS, ['b', 'q']);
}

export const kingSquare = (board: (Piece | null)[], color: Color) => board.findIndex((p) => p?.type === 'k' && p.color === color);

export const inCheck = (s: ChessState, color: Color = s.turn) => attacked(s.board, kingSquare(s.board, color), other(color));

function pseudoMoves(s: ChessState): Move[] {
  const moves: Move[] = [];
  const { board, turn } = s;
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p || p.color !== turn) continue;
    const r = rowOf(i);
    const c = colOf(i);
    const add = (to: number) => {
      const target = board[to];
      if (target && target.color === turn) return false;
      moves.push({ from: i, to, capture: !!target });
      return !target;
    };
    if (p.type === 'p') {
      const dir = turn === 'w' ? -1 : 1;
      const start = turn === 'w' ? 6 : 1;
      const promoRow = turn === 'w' ? 0 : 7;
      const pushPromos = (to: number, capture: boolean, enPassant = false) => {
        if (rowOf(to) === promoRow) for (const promo of ['q', 'r', 'b', 'n'] as PieceType[]) moves.push({ from: i, to, promo, capture });
        else moves.push({ from: i, to, capture, enPassant });
      };
      const one = (r + dir) * 8 + c;
      if (r + dir >= 0 && r + dir < 8 && !board[one]) {
        pushPromos(one, false);
        const two = (r + 2 * dir) * 8 + c;
        if (r === start && !board[two]) moves.push({ from: i, to: two });
      }
      for (const dc of [-1, 1]) {
        const cc = c + dc;
        const rr = r + dir;
        if (cc < 0 || cc > 7 || rr < 0 || rr > 7) continue;
        const to = rr * 8 + cc;
        const target = board[to];
        if (target && target.color !== turn) pushPromos(to, true);
        else if (to === s.ep) pushPromos(to, true, true);
      }
    } else if (p.type === 'n' || p.type === 'k') {
      for (const [dr, dc] of p.type === 'n' ? KNIGHT : KING) {
        const rr = r + dr!;
        const cc = c + dc!;
        if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) add(rr * 8 + cc);
      }
      if (p.type === 'k') {
        const home = turn === 'w' ? 60 : 4;
        const enemy = other(turn);
        if (i === home && !attacked(board, home, enemy)) {
          const kSide = turn === 'w' ? s.castling.wk : s.castling.bk;
          const qSide = turn === 'w' ? s.castling.wq : s.castling.bq;
          if (kSide && !board[home + 1] && !board[home + 2] && board[home + 3]?.type === 'r' && !attacked(board, home + 1, enemy) && !attacked(board, home + 2, enemy))
            moves.push({ from: i, to: home + 2, castle: true });
          if (qSide && !board[home - 1] && !board[home - 2] && !board[home - 3] && board[home - 4]?.type === 'r' && !attacked(board, home - 1, enemy) && !attacked(board, home - 2, enemy))
            moves.push({ from: i, to: home - 2, castle: true });
        }
      }
    } else {
      const dirs = p.type === 'r' ? ROOK_DIRS : p.type === 'b' ? BISHOP_DIRS : [...ROOK_DIRS, ...BISHOP_DIRS];
      for (const [dr, dc] of dirs) {
        let rr = r + dr!;
        let cc = c + dc!;
        while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && add(rr * 8 + cc)) {
          rr += dr!;
          cc += dc!;
        }
      }
    }
  }
  return moves;
}

export function makeMove(s: ChessState, m: Move): ChessState {
  const board = [...s.board];
  const piece = board[m.from]!;
  const captured = board[m.to];
  board[m.to] = m.promo ? { type: m.promo, color: piece.color } : piece;
  board[m.from] = null;
  if (m.enPassant || (piece.type === 'p' && m.to === s.ep)) {
    board[m.to + (piece.color === 'w' ? 8 : -8)] = null;
  }
  if (piece.type === 'k' && Math.abs(m.to - m.from) === 2) {
    const rookFrom = m.to > m.from ? m.from + 3 : m.from - 4;
    const rookTo = m.to > m.from ? m.from + 1 : m.from - 1;
    board[rookTo] = board[rookFrom]!;
    board[rookFrom] = null;
  }
  const castling = { ...s.castling };
  if (piece.type === 'k') {
    if (piece.color === 'w') castling.wk = castling.wq = false;
    else castling.bk = castling.bq = false;
  }
  for (const corner of [m.from, m.to]) {
    if (corner === 63) castling.wk = false;
    if (corner === 56) castling.wq = false;
    if (corner === 7) castling.bk = false;
    if (corner === 0) castling.bq = false;
  }
  const ep = piece.type === 'p' && Math.abs(m.to - m.from) === 16 ? (m.from + m.to) / 2 : -1;
  return {
    board,
    turn: other(s.turn),
    castling,
    ep,
    halfmove: piece.type === 'p' || captured ? 0 : s.halfmove + 1,
    fullmove: s.fullmove + (s.turn === 'b' ? 1 : 0),
  };
}

export function legalMoves(s: ChessState): Move[] {
  return pseudoMoves(s).filter((m) => !inCheck(makeMove(s, m), s.turn));
}

export function insufficientMaterial(board: (Piece | null)[]): boolean {
  const pieces = board.filter((p): p is Piece => !!p && p.type !== 'k');
  if (pieces.length === 0) return true;
  return pieces.length === 1 && (pieces[0]!.type === 'n' || pieces[0]!.type === 'b');
}

export type Outcome = { result: 'checkmate'; winner: Color } | { result: 'stalemate' | 'fifty-move' | 'insufficient' } | null;

export function outcome(s: ChessState): Outcome {
  if (legalMoves(s).length === 0) return inCheck(s) ? { result: 'checkmate', winner: other(s.turn) } : { result: 'stalemate' };
  if (s.halfmove >= 100) return { result: 'fifty-move' };
  if (insufficientMaterial(s.board)) return { result: 'insufficient' };
  return null;
}

// ---- Evaluation & search ----------------------------------------------------------
const VALUE: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
// Piece-square tables from White's point of view (index 0 = a8).
const PST: Partial<Record<PieceType, number[]>> = {
  p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
};

/** Static evaluation from the side to move's perspective. */
export function evaluate(s: ChessState): number {
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const p = s.board[i];
    if (!p) continue;
    const table = PST[p.type];
    const pstIndex = p.color === 'w' ? i : (7 - rowOf(i)) * 8 + colOf(i);
    const v = VALUE[p.type] + (table ? table[pstIndex]! : 0);
    score += p.color === 'w' ? v : -v;
  }
  return s.turn === 'w' ? score : -score;
}

const MATE = 100_000;

function order(moves: Move[], s: ChessState) {
  return moves
    .map((m) => ({ m, k: (m.capture ? 10 * VALUE[s.board[m.to]?.type ?? 'p'] - VALUE[s.board[m.from]!.type] / 10 : 0) + (m.promo === 'q' ? 800 : 0) }))
    .sort((a, b) => b.k - a.k)
    .map((x) => x.m);
}

function search(s: ChessState, depth: number, alpha: number, beta: number, ply: number): number {
  const moves = legalMoves(s);
  if (!moves.length) return inCheck(s) ? -MATE + ply : 0;
  if (s.halfmove >= 100 || insufficientMaterial(s.board)) return 0;
  if (depth === 0) return quiesce(s, alpha, beta, 4);
  for (const m of order(moves, s)) {
    const v = -search(makeMove(s, m), depth - 1, -beta, -alpha, ply + 1);
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

/** Captures-only extension to avoid horizon blunders. */
function quiesce(s: ChessState, alpha: number, beta: number, depth: number): number {
  const stand = evaluate(s);
  if (depth === 0) return stand;
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  for (const m of order(legalMoves(s).filter((m) => m.capture || m.promo), s)) {
    const v = -quiesce(makeMove(s, m), -beta, -alpha, depth - 1);
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

export function chooseMove(s: ChessState, depth: number, random: () => number, blunder = 0): Move | null {
  const moves = legalMoves(s);
  if (!moves.length) return null;
  if (random() < blunder) return moves[Math.floor(random() * moves.length)]!;
  let best = -Infinity;
  let picks: Move[] = [];
  for (const m of order(moves, s)) {
    const v = -search(makeMove(s, m), depth - 1, -Infinity, -best + 1, 1);
    if (v > best) {
      best = v;
      picks = [m];
    } else if (v === best) picks.push(m);
  }
  return picks[Math.floor(random() * picks.length)]!;
}
