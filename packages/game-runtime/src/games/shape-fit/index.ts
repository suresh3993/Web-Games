import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { ORTHO, shuffle } from '../../kit/util';

type Cell = [number, number]; // [row, col]
const COLORS = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6'];

export function normalize(cells: Cell[]): Cell[] {
  const minR = Math.min(...cells.map((c) => c[0]));
  const minC = Math.min(...cells.map((c) => c[1]));
  return cells.map(([r, c]) => [r - minR, c - minC] as Cell).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
export const rotateCells = (cells: Cell[]) => normalize(cells.map(([r, c]) => [c, -r] as Cell));
export const flipCells = (cells: Cell[]) => normalize(cells.map(([r, c]) => [r, -c] as Cell));

/** Partitions an R×C rectangle into random connected pieces of 3–5 cells (a tiling always exists). */
export function partition(rows: number, cols: number, random: () => number): Cell[][] {
  for (;;) {
    const owner = Array(rows * cols).fill(-1);
    const pieces: Cell[][] = [];
    let ok = true;
    for (const start of [...Array(rows * cols).keys()]) {
      if (owner[start] >= 0) continue;
      const target = 3 + Math.floor(random() * 3);
      const cells = [start];
      owner[start] = pieces.length;
      while (cells.length < target) {
        const options = shuffle(random, cells).flatMap((i) =>
          ORTHO.map(([dr, dc]) => [Math.floor(i / cols) + dr, (i % cols) + dc]).filter(([r, c]) => r! >= 0 && c! >= 0 && r! < rows && c! < cols && owner[r! * cols + c!] < 0).map(([r, c]) => r! * cols + c!),
        );
        if (!options.length) break;
        owner[options[0]!] = pieces.length;
        cells.push(options[0]!);
      }
      if (cells.length < 2) ok = false;
      pieces.push(cells.map((i) => [Math.floor(i / cols), i % cols] as Cell));
    }
    if (ok) return pieces;
  }
}

interface Piece {
  shape: Cell[];
  color: string;
  placedAt: number | null; // anchor board index
}

class ShapeFit extends DomGame {
  private rows = 4;
  private cols = 5;
  private level = 1;
  private pieces: Piece[] = [];
  private selected = -1;
  private message = '';

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.level = 1;
    this.load();
  }

  private load() {
    this.rows = 3 + this.level;
    this.cols = 4 + this.level;
    this.pieces = partition(this.rows, this.cols, this.random).map((cells, k) => {
      let shape = normalize(cells);
      for (let r = Math.floor(this.random() * 4); r > 0; r--) shape = rotateCells(shape);
      if (this.random() < 0.5) shape = flipCells(shape);
      return { shape, color: COLORS[k % COLORS.length]!, placedAt: null };
    });
    this.pieces = shuffle(this.random, this.pieces);
    this.selected = 0;
    this.message = 'Select a piece, rotate / flip it, then click the board where its top-left block should go.';
  }

  private occupancy(except = -1): number[] {
    const occ = Array(this.rows * this.cols).fill(-1);
    this.pieces.forEach((p, k) => {
      if (p.placedAt === null || k === except) return;
      const ar = Math.floor(p.placedAt / this.cols);
      const ac = p.placedAt % this.cols;
      for (const [r, c] of p.shape) occ[(ar + r) * this.cols + ac + c] = k;
    });
    return occ;
  }

  private place(anchor: number) {
    const p = this.pieces[this.selected];
    if (!p) return;
    const occ = this.occupancy(this.selected);
    const ar = Math.floor(anchor / this.cols);
    const ac = anchor % this.cols;
    const [r0, c0] = p.shape[0]!;
    const fits = p.shape.every(([r, c]) => {
      const rr = ar + r - r0;
      const cc = ac + c - c0;
      return rr >= 0 && cc >= 0 && rr < this.rows && cc < this.cols && occ[rr * this.cols + cc]! < 0;
    });
    if (!fits) {
      this.message = "That piece doesn't fit there.";
      this.sfx.bad();
      return;
    }
    p.placedAt = (ar - r0) * this.cols + (ac - c0);
    this.sfx.click();
    this.selected = this.pieces.findIndex((q) => q.placedAt === null);
    if (this.selected < 0) {
      this.addScore(400 * this.level + Math.max(0, 300 - Math.floor(this.elapsed)));
      this.sfx.win();
      if (this.level >= 4) {
        this.end('won', { levels: 4 });
        return;
      }
      this.level++;
      this.load();
    }
  }

  protected override onAction(action: string, value: string) {
    if (action === 'piece') {
      const k = Number(value);
      this.selected = k;
      this.pieces[k]!.placedAt = null;
    } else if (action === 'rotate' && this.selected >= 0) this.pieces[this.selected]!.shape = rotateCells(this.pieces[this.selected]!.shape);
    else if (action === 'flip' && this.selected >= 0) this.pieces[this.selected]!.shape = flipCells(this.pieces[this.selected]!.shape);
    else if (action === 'board') {
      const i = Number(value);
      const owner = this.occupancy()[i]!;
      if (owner >= 0) {
        this.pieces[owner]!.placedAt = null;
        this.selected = owner;
      } else this.place(i);
    }
    if (!this.finished) this.render();
  }

  protected override onKey(e: KeyboardEvent) {
    if (e.key.toLowerCase() === 'r') this.onAction('rotate', '');
    else if (e.key.toLowerCase() === 'f') this.onAction('flip', '');
    else return false;
    return true;
  }

  private mini(shape: Cell[], color: string) {
    const h = Math.max(...shape.map((c) => c[0])) + 1;
    const w = Math.max(...shape.map((c) => c[1])) + 1;
    const set = new Set(shape.map(([r, c]) => r * w + c));
    return `<span style="display:grid;grid-template-columns:repeat(${w},14px);gap:2px">${[...Array(w * h).keys()].map((i) => `<i style="width:14px;height:14px;border-radius:3px;background:${set.has(i) ? color : 'transparent'}"></i>`).join('')}</span>`;
  }

  protected view() {
    const occ = this.occupancy();
    const board = occ
      .map((k, i) => `<button type="button" class="pv-cell" style="border-radius:4px;background:${k >= 0 ? this.pieces[k]!.color : '#141b3a'}" data-action="board" data-value="${i}" aria-label="Board cell ${i + 1}${k >= 0 ? ' (filled — click to pick up)' : ''}"></button>`)
      .join('');
    const tray = this.pieces
      .map((p, k) => (p.placedAt === null ? `<button type="button" class="pv-btn${k === this.selected ? ' sel' : ''}" style="padding:8px" data-action="piece" data-value="${k}" aria-label="Piece ${k + 1}">${this.mini(p.shape, p.color)}</button>` : ''))
      .join('');
    return `
      <div class="pv-hud"><span>Level <b>${this.level}/4</b></span><span>Pieces left <b>${this.pieces.filter((p) => p.placedAt === null).length}</b></span><span>Score <b>${this.score}</b></span></div>
      <p class="pv-msg" role="status">${this.message}</p>
      <div class="pv-grid" style="--cols:${this.cols};--gap:3px;--w:${this.cols * 56}px">${board}</div>
      <div class="pv-row"><button type="button" class="pv-btn small" data-action="rotate" data-value="">⟳ Rotate (R)</button><button type="button" class="pv-btn small" data-action="flip" data-value="">⇋ Flip (F)</button></div>
      <div class="pv-row">${tray}</div>`;
  }
}

export default defineGame(
  { key: 'shape-fit', engine: 'DOM', aspectRatio: 0.9, maxScore: 400 * 10 + 300 * 4, controls: [{ action: 'Place', keys: 'Pick a piece, click the board' }, { action: 'Rotate / flip', keys: 'R / F' }] },
  (host) => new ShapeFit(host),
);
