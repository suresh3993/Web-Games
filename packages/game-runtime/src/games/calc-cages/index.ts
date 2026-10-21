import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { formatTime } from '../../kit/util';
import { latinSquare, makeCages, solvedCalc, type Cage } from './logic';

const SIZES = { 4: 1200, 5: 2500, 6: 4000 } as const;
type Size = keyof typeof SIZES;

class CalcCages extends DomGame {
  private n: Size = 4;
  private cages: Cage[] = [];
  private owner: number[] = [];
  private values: number[] = [];
  private selected = 0;
  private touched = false;
  private shownSecond = -1;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    const solution = latinSquare(this.n, this.random);
    this.cages = makeCages(solution, this.n, this.random);
    this.owner = Array(this.n * this.n).fill(0);
    this.cages.forEach((c, k) => c.cells.forEach((i) => (this.owner[i] = k)));
    this.values = Array(this.n * this.n).fill(0);
    this.selected = 0;
    this.touched = false;
  }

  protected override onTick() {
    const s = Math.floor(this.elapsed);
    if (s !== this.shownSecond) {
      this.shownSecond = s;
      this.render();
    }
  }

  private enter(d: number) {
    if (d > this.n) return;
    this.values[this.selected] = d;
    this.touched = true;
    this.sfx.click();
    if (solvedCalc(this.values, this.n, this.cages)) {
      this.setScore(SIZES[this.n] + Math.max(0, 900 - Math.floor(this.elapsed)) * 2);
      this.sfx.win();
      this.end('won', { seconds: Math.floor(this.elapsed) });
      return;
    }
    this.render();
  }

  protected override onAction(action: string, value: string) {
    if (action === 'size' && !this.touched) {
      this.n = Number(value) as Size;
      this.reset();
    } else if (action === 'cell') this.selected = Number(value);
    else if (action === 'digit') return this.enter(Number(value));
    this.render();
  }

  protected override onKey(e: KeyboardEvent) {
    if (/^[1-9]$/.test(e.key)) {
      this.enter(Number(e.key));
      return true;
    }
    if (e.key === 'Backspace' || e.key === '0') {
      this.enter(0);
      return true;
    }
    const n = this.n;
    const moves: Record<string, number> = { ArrowUp: -n, ArrowDown: n, ArrowLeft: -1, ArrowRight: 1 };
    if (e.key in moves) {
      const next = this.selected + moves[e.key]!;
      if (next >= 0 && next < n * n) this.selected = next;
      this.render();
      return true;
    }
    return false;
  }

  protected view() {
    const n = this.n;
    const dupes = new Set<number>();
    for (let i = 0; i < n * n; i++) {
      const v = this.values[i];
      if (!v) continue;
      for (let j = 0; j < n * n; j++) if (j !== i && this.values[j] === v && (Math.floor(j / n) === Math.floor(i / n) || j % n === i % n)) dupes.add(i);
    }
    const cells = this.values
      .map((v, i) => {
        const k = this.owner[i]!;
        const cage = this.cages[k]!;
        const first = Math.min(...cage.cells) === i;
        const r = Math.floor(i / n);
        const c = i % n;
        const edge = (ri: number, ci: number) => (ri < 0 || ci < 0 || ri >= n || ci >= n || this.owner[ri * n + ci] !== k ? '3px solid #6d4aff' : '1px solid rgba(148,163,255,.2)');
        const border = `border-top:${edge(r - 1, c)};border-bottom:${edge(r + 1, c)};border-left:${edge(r, c - 1)};border-right:${edge(r, c + 1)};`;
        return `<button type="button" class="pv-cell${i === this.selected ? ' sel' : ''}" style="border-radius:0;${border}color:${dupes.has(i) ? '#fb7185' : '#e6e9f5'};position:relative" data-action="cell" data-value="${i}" aria-label="Cell row ${r + 1} column ${c + 1}${first ? `, cage ${cage.target}${cage.op}` : ''}${v ? `: ${v}` : ''}">
          ${first ? `<span style="position:absolute;left:4px;top:2px;font-size:clamp(9px,1.8vmin,12px);color:#facc15">${cage.target}${cage.op}</span>` : ''}${v || ''}</button>`;
      })
      .join('');
    const sizes = ([4, 5, 6] as Size[]).map((s) => `<button type="button" class="pv-btn small${s === n ? ' primary' : ''}" data-action="size" data-value="${s}" ${this.touched ? 'disabled' : ''}>${s}×${s}</button>`).join('');
    const pad = [...Array(n).keys()].map((d) => `<button type="button" class="pv-btn" style="min-width:42px" data-action="digit" data-value="${d + 1}">${d + 1}</button>`).join('') + '<button type="button" class="pv-btn" data-action="digit" data-value="0">⌫</button>';
    return `
      <div class="pv-row">${sizes}</div>
      <div class="pv-hud"><span>Time <b>${formatTime(this.elapsed)}</b></span></div>
      <div class="pv-grid" style="--cols:${n};--gap:0px;--w:${n * 76}px">${cells}</div>
      <div class="pv-row">${pad}</div>
      <p class="pv-muted">Each row and column uses 1–${n} once. Cells in a cage combine to the target with the shown operation.</p>`;
  }
}

export default defineGame(
  { key: 'calc-cages', engine: 'DOM', aspectRatio: 0.85, maxScore: 4000 + 1800, controls: [{ action: 'Fill', keys: 'Click a cell, then a number' }] },
  (host) => new CalcCages(host),
);
