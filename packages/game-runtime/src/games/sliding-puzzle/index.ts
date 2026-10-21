import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { formatTime, ORTHO } from '../../kit/util';

const SIZES = { 3: 1500, 4: 4000, 5: 8000 } as const;
type Size = keyof typeof SIZES;

/** Shuffles by making random legal moves from the solved state, so every puzzle is solvable. */
export function scramble(n: number, random: () => number, steps: number): number[] {
  const tiles = [...Array(n * n - 1).keys()].map((i) => i + 1).concat(0);
  let blank = n * n - 1;
  let prev = -1;
  for (let s = 0; s < steps; s++) {
    const r = Math.floor(blank / n);
    const c = blank % n;
    const options = ORTHO.map(([dr, dc]) => [r + dr, c + dc]).filter(([rr, cc]) => rr! >= 0 && cc! >= 0 && rr! < n && cc! < n).map(([rr, cc]) => rr! * n + cc!).filter((i) => i !== prev);
    const next = options[Math.floor(random() * options.length)]!;
    tiles[blank] = tiles[next]!;
    tiles[next] = 0;
    prev = blank;
    blank = next;
  }
  return tiles;
}

export const solved = (tiles: number[]) => tiles.every((v, i) => (i === tiles.length - 1 ? v === 0 : v === i + 1));

class SlidingPuzzle extends DomGame {
  private n: Size = 3;
  private tiles: number[] = [];
  private moves = 0;
  private shownSecond = -1;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    do this.tiles = scramble(this.n, this.random, this.n * this.n * 25);
    while (solved(this.tiles));
    this.moves = 0;
  }

  protected override onTick() {
    const s = Math.floor(this.elapsed);
    if (this.moves && s !== this.shownSecond) {
      this.shownSecond = s;
      this.render();
    }
  }

  private slide(index: number) {
    const blank = this.tiles.indexOf(0);
    const n = this.n;
    const sameRow = Math.floor(index / n) === Math.floor(blank / n);
    const sameCol = index % n === blank % n;
    if (index === blank || (!sameRow && !sameCol)) return;
    // Slide the whole row/column segment toward the blank (like a real puzzle).
    const step = sameRow ? (index > blank ? 1 : -1) : index > blank ? n : -n;
    for (let i = blank; i !== index; i += step) {
      this.tiles[i] = this.tiles[i + step]!;
      this.moves++;
    }
    this.tiles[index] = 0;
    this.sfx.click();
    if (solved(this.tiles)) {
      const optimalish = this.n * this.n * 4;
      this.setScore(SIZES[this.n] + Math.max(0, 600 - Math.floor(this.elapsed)) * 2 + Math.max(0, optimalish * 3 - this.moves) * 2);
      this.sfx.win();
      this.end('won', { moves: this.moves, seconds: Math.floor(this.elapsed) });
      return;
    }
    this.render();
  }

  protected override onAction(action: string, value: string) {
    if (action === 'size' && this.moves === 0) {
      this.n = Number(value) as Size;
      this.reset();
      this.render();
    } else if (action === 'tile') this.slide(Number(value));
  }

  protected override onKey(e: KeyboardEvent) {
    // Arrow keys move the tile *into* the gap from the opposite side.
    const blank = this.tiles.indexOf(0);
    const r = Math.floor(blank / this.n);
    const c = blank % this.n;
    const map: Record<string, [number, number]> = { ArrowUp: [r + 1, c], ArrowDown: [r - 1, c], ArrowLeft: [r, c + 1], ArrowRight: [r, c - 1] };
    const target = map[e.key];
    if (!target) return false;
    const [tr, tc] = target;
    if (tr >= 0 && tc >= 0 && tr < this.n && tc < this.n) this.slide(tr * this.n + tc);
    return true;
  }

  protected view() {
    const n = this.n;
    const tiles = this.tiles
      .map((v, i) => {
        if (!v) return `<div class="pv-cell" style="background:transparent;border-style:dashed" aria-label="Empty space"></div>`;
        const correct = v === i + 1;
        const hue = 250 + ((v - 1) / (n * n)) * 90;
        return `<button type="button" class="pv-cell" style="background:hsl(${hue} 70% ${correct ? 42 : 30}%);font-size:clamp(16px,${16 / n + 2}vmin,40px)" data-action="tile" data-value="${i}" aria-label="Tile ${v}">${v}</button>`;
      })
      .join('');
    const sizes = ([3, 4, 5] as Size[])
      .map((k) => `<button type="button" class="pv-btn small${k === n ? ' primary' : ''}" data-action="size" data-value="${k}" ${this.moves ? 'disabled' : ''}>${k}×${k}</button>`)
      .join('');
    return `
      <div class="pv-row">${sizes}</div>
      <div class="pv-hud"><span>Moves <b>${this.moves}</b></span><span>Time <b>${formatTime(this.elapsed)}</b></span></div>
      <div class="pv-grid" style="--cols:${n};--gap:6px;--w:420px">${tiles}</div>
      <p class="pv-muted">Click a tile in the gap's row or column, or use the arrow keys. Order tiles 1→${n * n - 1}.</p>`;
  }
}

export default defineGame(
  { key: 'sliding-puzzle', engine: 'DOM', aspectRatio: 0.9, maxScore: 12_000, controls: [{ action: 'Slide', keys: 'Click / arrow keys' }] },
  (host) => new SlidingPuzzle(host),
);
