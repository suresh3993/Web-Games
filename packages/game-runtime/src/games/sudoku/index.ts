import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { formatTime } from '../../kit/util';
import { conflicts, isComplete, makePuzzle, PEERS, type Grid } from './logic';

const LEVELS = {
  easy: { clues: 40, base: 1000, par: 600 },
  medium: { clues: 32, base: 2000, par: 900 },
  hard: { clues: 27, base: 3500, par: 1200 },
  expert: { clues: 24, base: 5000, par: 1500 },
} as const;
type Level = keyof typeof LEVELS;
const MAX_MISTAKES = 3;

class Sudoku extends DomGame {
  private level: Level = 'easy';
  private givens: Grid = [];
  private grid: Grid = [];
  private solution: Grid = [];
  private notes: Set<number>[] = [];
  private selected = 40;
  private noteMode = false;
  private mistakes = 0;
  private touched = false;
  private shownSecond = -1;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    const { puzzle, solution } = makePuzzle(this.random, LEVELS[this.level].clues);
    this.givens = puzzle;
    this.grid = [...puzzle];
    this.solution = solution;
    this.notes = Array.from({ length: 81 }, () => new Set<number>());
    this.selected = this.grid.indexOf(0);
    this.noteMode = false;
    this.mistakes = 0;
    this.touched = false;
  }

  protected override onTick() {
    const s = Math.floor(this.elapsed);
    if (s !== this.shownSecond) {
      this.shownSecond = s;
      this.render();
    }
  }

  private enter(digit: number) {
    const i = this.selected;
    if (i < 0 || this.givens[i]) return;
    this.touched = true;
    if (digit === 0) {
      this.grid[i] = 0;
      this.notes[i]!.clear();
    } else if (this.noteMode) {
      const n = this.notes[i]!;
      if (n.has(digit)) n.delete(digit);
      else n.add(digit);
    } else {
      this.grid[i] = digit;
      this.notes[i]!.clear();
      if (digit !== this.solution[i]) {
        this.mistakes++;
        this.sfx.bad();
        if (this.mistakes >= MAX_MISTAKES) {
          this.end('lost', { mistakes: this.mistakes });
          return;
        }
      } else {
        this.sfx.click();
        // Clear this digit from the notes of every peer (row, column and box).
        for (const j of PEERS[i]!) this.notes[j]!.delete(digit);
      }
      if (isComplete(this.grid, this.solution)) {
        const l = LEVELS[this.level];
        this.setScore(l.base + Math.max(0, l.par - Math.floor(this.elapsed)) * 2 - this.mistakes * 200);
        this.sfx.win();
        this.end('won', { seconds: Math.floor(this.elapsed), mistakes: this.mistakes });
        return;
      }
    }
    this.render();
  }

  protected override onAction(action: string, value: string) {
    if (action === 'level' && !this.touched) {
      this.level = value as Level;
      this.reset();
    } else if (action === 'cell') this.selected = Number(value);
    else if (action === 'digit') this.enter(Number(value));
    else if (action === 'notes') this.noteMode = !this.noteMode;
    this.render();
  }

  protected override onKey(e: KeyboardEvent) {
    const moves: Record<string, number> = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 };
    if (e.key in moves) {
      const next = this.selected + moves[e.key]!;
      if (next >= 0 && next < 81 && !(Math.abs(moves[e.key]!) === 1 && Math.floor(next / 9) !== Math.floor(this.selected / 9))) this.selected = next;
      this.render();
      return true;
    }
    if (/^[1-9]$/.test(e.key)) {
      this.enter(Number(e.key));
      return true;
    }
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
      this.enter(0);
      return true;
    }
    if (e.key.toLowerCase() === 'n') {
      this.noteMode = !this.noteMode;
      this.render();
      return true;
    }
    return false;
  }

  protected view() {
    const bad = conflicts(this.grid);
    const sel = this.selected;
    const selVal = this.grid[sel] ?? 0;
    const cells = this.grid
      .map((v, i) => {
        const r = Math.floor(i / 9);
        const c = i % 9;
        const peer = sel >= 0 && (r === Math.floor(sel / 9) || c === sel % 9);
        const same = selVal && v === selVal;
        const wrong = v && v !== this.solution[i];
        const bg = i === sel ? '#3b2f8f' : same ? '#24306b' : peer ? '#161e45' : '#11183a';
        const color = this.givens[i] ? '#e6e9f5' : wrong || bad.has(i) ? '#fb7185' : '#67e8f9';
        const border = `border-right:${c % 3 === 2 && c < 8 ? '3px solid #6d4aff' : '1px solid rgba(148,163,255,.16)'};border-bottom:${r % 3 === 2 && r < 8 ? '3px solid #6d4aff' : '1px solid rgba(148,163,255,.16)'};`;
        const content = v
          ? String(v)
          : this.notes[i]!.size
            ? `<span style="display:grid;grid-template-columns:repeat(3,1fr);font-size:clamp(7px,1.4vmin,10px);color:#9aa0c0;width:90%;line-height:1.1">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<span>${this.notes[i]!.has(d) ? d : '&nbsp;'}</span>`).join('')}</span>`
            : '';
        return `<button type="button" class="pv-cell" style="border-radius:0;background:${bg};color:${color};${border}" data-action="cell" data-value="${i}" aria-label="Row ${r + 1} column ${c + 1}${v ? `: ${v}` : ''}">${content}</button>`;
      })
      .join('');
    const levels = (Object.keys(LEVELS) as Level[])
      .map((k) => `<button type="button" class="pv-btn small${k === this.level ? ' primary' : ''}" data-action="level" data-value="${k}" ${this.touched ? 'disabled' : ''}>${k[0]!.toUpperCase() + k.slice(1)}</button>`)
      .join('');
    const pad = [1, 2, 3, 4, 5, 6, 7, 8, 9]
      .map((d) => {
        const left = 9 - this.grid.filter((v, i) => v === d && v === this.solution[i]).length;
        return `<button type="button" class="pv-btn" style="min-width:42px" data-action="digit" data-value="${d}" ${left === 0 ? 'disabled' : ''}>${d}</button>`;
      })
      .join('');
    return `
      <div class="pv-row">${levels}</div>
      <div class="pv-hud"><span>Time <b>${formatTime(this.elapsed)}</b></span><span>Mistakes <b>${this.mistakes}/${MAX_MISTAKES}</b></span></div>
      <div class="pv-grid" style="--cols:9;--gap:0px;--w:440px;border:3px solid #6d4aff;border-radius:6px;overflow:hidden">${cells}</div>
      <div class="pv-row">${pad}</div>
      <div class="pv-row">
        <button type="button" class="pv-btn${this.noteMode ? ' primary' : ''}" data-action="notes" data-value="" aria-pressed="${this.noteMode}">✎ Notes ${this.noteMode ? 'on' : 'off'}</button>
        <button type="button" class="pv-btn" data-action="digit" data-value="0">⌫ Erase</button>
      </div>
      <p class="pv-muted">Arrows to move · 1–9 to fill · N for notes · Backspace to erase</p>`;
  }
}

export default defineGame(
  {
    key: 'sudoku',
    engine: 'DOM',
    aspectRatio: 0.8,
    maxScore: 8_000,
    controls: [
      { action: 'Select', keys: 'Click / arrows' },
      { action: 'Fill', keys: '1–9' },
      { action: 'Notes', keys: 'N' },
    ],
  },
  (host) => new Sudoku(host),
);
