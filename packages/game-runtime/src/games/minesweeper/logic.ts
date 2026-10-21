import { ALL8, inBounds, type Rng } from '../../kit/util';

export interface MineCell {
  mine: boolean;
  adjacent: number;
  revealed: boolean;
  flagged: boolean;
}

export interface MineBoard {
  rows: number;
  cols: number;
  mines: number;
  cells: MineCell[][];
  generated: boolean;
  exploded: boolean;
}

export const blankBoard = (rows: number, cols: number, mines: number): MineBoard => ({
  rows,
  cols,
  mines,
  generated: false,
  exploded: false,
  cells: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ mine: false, adjacent: 0, revealed: false, flagged: false }))),
});

/** Places mines after the first click so the clicked cell and its neighbours are always safe. */
export function generate(board: MineBoard, safeR: number, safeC: number, random: Rng) {
  const forbidden = new Set<number>();
  for (const [dr, dc] of [[0, 0], ...ALL8]) {
    const r = safeR + dr!;
    const c = safeC + dc!;
    if (inBounds(r, c, board.rows, board.cols)) forbidden.add(r * board.cols + c);
  }
  const candidates: number[] = [];
  for (let i = 0; i < board.rows * board.cols; i++) if (!forbidden.has(i)) candidates.push(i);
  const count = Math.min(board.mines, candidates.length);
  for (let n = 0; n < count; n++) {
    const j = n + Math.floor(random() * (candidates.length - n));
    [candidates[n], candidates[j]] = [candidates[j]!, candidates[n]!];
    const idx = candidates[n]!;
    board.cells[Math.floor(idx / board.cols)]![idx % board.cols]!.mine = true;
  }
  for (let r = 0; r < board.rows; r++)
    for (let c = 0; c < board.cols; c++) {
      board.cells[r]![c]!.adjacent = ALL8.filter(([dr, dc]) => {
        const rr = r + dr;
        const cc = c + dc;
        return inBounds(rr, cc, board.rows, board.cols) && board.cells[rr]![cc]!.mine;
      }).length;
    }
  board.generated = true;
}

/** Reveals a cell (flood-filling zeros). Returns the number of newly revealed cells. */
export function reveal(board: MineBoard, r: number, c: number, random: Rng): number {
  if (!board.generated) generate(board, r, c, random);
  const start = board.cells[r]![c]!;
  if (start.revealed || start.flagged) return 0;
  if (start.mine) {
    start.revealed = true;
    board.exploded = true;
    return 0;
  }
  let count = 0;
  const stack: [number, number][] = [[r, c]];
  while (stack.length) {
    const [cr, cc] = stack.pop()!;
    const cell = board.cells[cr]![cc]!;
    if (cell.revealed || cell.flagged || cell.mine) continue;
    cell.revealed = true;
    count++;
    if (cell.adjacent === 0) {
      for (const [dr, dc] of ALL8) {
        const nr = cr + dr;
        const nc = cc + dc;
        if (inBounds(nr, nc, board.rows, board.cols) && !board.cells[nr]![nc]!.revealed) stack.push([nr, nc]);
      }
    }
  }
  return count;
}

/** "Chord": on a revealed number with that many flags around it, reveal all other neighbours. */
export function chord(board: MineBoard, r: number, c: number, random: Rng): number {
  const cell = board.cells[r]![c]!;
  if (!cell.revealed || cell.adjacent === 0) return 0;
  const neighbours = ALL8.map(([dr, dc]) => [r + dr, c + dc] as const).filter(([nr, nc]) => inBounds(nr, nc, board.rows, board.cols));
  const flags = neighbours.filter(([nr, nc]) => board.cells[nr]![nc]!.flagged).length;
  if (flags !== cell.adjacent) return 0;
  let total = 0;
  for (const [nr, nc] of neighbours) total += reveal(board, nr, nc, random);
  return total;
}

export const toggleFlag = (board: MineBoard, r: number, c: number) => {
  const cell = board.cells[r]![c]!;
  if (!cell.revealed) cell.flagged = !cell.flagged;
};

export const revealedSafe = (board: MineBoard) => board.cells.flat().filter((c) => c.revealed && !c.mine).length;

export const isWon = (board: MineBoard) => board.generated && !board.exploded && revealedSafe(board) === board.rows * board.cols - board.mines;

export const flagsPlaced = (board: MineBoard) => board.cells.flat().filter((c) => c.flagged).length;
