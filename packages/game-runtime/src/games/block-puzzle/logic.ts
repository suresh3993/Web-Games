/** Falling-block puzzle rules (original implementation). Pure and deterministic. */

export const COLS = 10;
export const ROWS = 20;

export type Cell = number; // 0 = empty, 1..7 = piece colour index
export type Board = Cell[][];

/** Seven tetromino shapes as rotation-0 cell offsets in a 4x4 box. */
export const SHAPES: number[][][] = [
  [[0, 1], [1, 1], [2, 1], [3, 1]], // I
  [[0, 0], [0, 1], [1, 1], [2, 1]], // J
  [[2, 0], [0, 1], [1, 1], [2, 1]], // L
  [[1, 0], [2, 0], [1, 1], [2, 1]], // O
  [[1, 0], [2, 0], [0, 1], [1, 1]], // S
  [[1, 0], [0, 1], [1, 1], [2, 1]], // T
  [[0, 0], [1, 0], [1, 1], [2, 1]], // Z
];

export interface Piece {
  type: number; // 0..6
  rot: number; // 0..3
  x: number;
  y: number;
}

export const emptyBoard = (): Board => Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(0));

/** Rotates the shape's cells clockwise `rot` times inside its bounding box. */
export function cells(piece: Piece): [number, number][] {
  const base = SHAPES[piece.type]!;
  const size = piece.type === 0 ? 4 : piece.type === 3 ? 4 : 3;
  return base.map(([cx, cy]) => {
    let x = cx!;
    let y = cy!;
    if (piece.type !== 3) {
      for (let i = 0; i < ((piece.rot % 4) + 4) % 4; i++) {
        const nx = size - 1 - y;
        y = x;
        x = nx;
      }
    }
    return [piece.x + x, piece.y + y] as [number, number];
  });
}

export function collides(board: Board, piece: Piece): boolean {
  return cells(piece).some(([x, y]) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && board[y]![x] !== 0));
}

/** Rotates with simple wall kicks; returns the original piece if no position fits. */
export function rotate(board: Board, piece: Piece, dir: 1 | -1 = 1): Piece {
  const rotated = { ...piece, rot: (piece.rot + dir + 4) % 4 };
  for (const kick of [0, -1, 1, -2, 2]) {
    const candidate = { ...rotated, x: rotated.x + kick };
    if (!collides(board, candidate)) return candidate;
  }
  return piece;
}

export function move(board: Board, piece: Piece, dx: number, dy: number): Piece | null {
  const next = { ...piece, x: piece.x + dx, y: piece.y + dy };
  return collides(board, next) ? null : next;
}

export function hardDropDistance(board: Board, piece: Piece): number {
  let d = 0;
  while (!collides(board, { ...piece, y: piece.y + d + 1 })) d++;
  return d;
}

/** Writes the piece into a copy of the board. */
export function lock(board: Board, piece: Piece): Board {
  const next = board.map((row) => [...row]);
  for (const [x, y] of cells(piece)) if (y >= 0) next[y]![x] = piece.type + 1;
  return next;
}

/** Removes full rows; returns the new board and the number of cleared lines. */
export function clearLines(board: Board): { board: Board; cleared: number } {
  const kept = board.filter((row) => row.some((c) => c === 0));
  const cleared = ROWS - kept.length;
  const fresh = Array.from({ length: cleared }, () => Array<Cell>(COLS).fill(0));
  return { board: [...fresh, ...kept], cleared };
}

export const LINE_POINTS = [0, 100, 300, 500, 800];

/** 7-bag randomiser: every piece appears once per bag. */
export function makeBag(random: () => number): number[] {
  const bag = [0, 1, 2, 3, 4, 5, 6];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [bag[i], bag[j]] = [bag[j]!, bag[i]!];
  }
  return bag;
}

export const spawn = (type: number): Piece => ({ type, rot: 0, x: 3, y: -1 });

export const gravityInterval = (level: number) => Math.max(0.05, 0.8 - (level - 1) * 0.07);
