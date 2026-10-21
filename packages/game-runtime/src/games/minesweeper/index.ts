import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { formatTime } from '../../kit/util';
import { blankBoard, chord, flagsPlaced, isWon, reveal, revealedSafe, toggleFlag, type MineBoard } from './logic';

const LEVELS = {
  beginner: { rows: 9, cols: 9, mines: 10, bonus: 1000, par: 120 },
  intermediate: { rows: 16, cols: 16, mines: 40, bonus: 4000, par: 360 },
  expert: { rows: 16, cols: 30, mines: 99, bonus: 10000, par: 900 },
} as const;
type Level = keyof typeof LEVELS;

const NUMBER_COLORS = ['', '#60a5fa', '#4ade80', '#f87171', '#a78bfa', '#fb923c', '#22d3ee', '#f472b6', '#e5e7eb'];

class Minesweeper extends DomGame {
  private level: Level = 'beginner';
  private board!: MineBoard;
  private flagMode = false;
  private cursor = { r: 0, c: 0 };

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    const l = LEVELS[this.level];
    this.board = blankBoard(l.rows, l.cols, l.mines);
    this.flagMode = false;
    this.cursor = { r: Math.floor(l.rows / 2), c: Math.floor(l.cols / 2) };
  }

  private shownSecond = -1;

  protected override onTick() {
    // Only the clock changes over time: re-render once per second.
    const second = Math.floor(this.elapsed);
    if (this.board.generated && second !== this.shownSecond) {
      this.shownSecond = second;
      this.render();
    }
  }

  private open(r: number, c: number) {
    const cell = this.board.cells[r]![c]!;
    const gained = cell.revealed ? chord(this.board, r, c, this.random) : reveal(this.board, r, c, this.random);
    if (gained) this.sfx.click();
    this.setScore(revealedSafe(this.board));
    if (this.board.exploded) {
      this.sfx.bad();
      this.end('lost', { revealed: revealedSafe(this.board) });
    } else if (isWon(this.board)) {
      const l = LEVELS[this.level];
      this.addScore(l.bonus + Math.max(0, l.par - Math.floor(this.elapsed)) * 10);
      this.sfx.win();
      this.end('won', { seconds: Math.floor(this.elapsed) });
    } else {
      this.render();
    }
  }

  private flag(r: number, c: number) {
    toggleFlag(this.board, r, c);
    this.render();
  }

  protected override onAction(action: string, value: string, event: Event) {
    if (action === 'level') {
      if (this.board.generated) return;
      this.level = value as Level;
      this.reset();
      this.render();
      return;
    }
    if (action === 'mode') {
      this.flagMode = !this.flagMode;
      this.render();
      return;
    }
    if (action === 'cell') {
      const [r, c] = value.split(',').map(Number) as [number, number];
      this.cursor = { r, c };
      const wantsFlag = event.type === 'contextmenu' || this.flagMode;
      if (wantsFlag && !this.board.cells[r]![c]!.revealed) this.flag(r, c);
      else this.open(r, c);
    }
  }

  protected override onKey(e: KeyboardEvent) {
    const l = LEVELS[this.level];
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const m = moves[e.key];
    if (m) {
      this.cursor = { r: Math.max(0, Math.min(l.rows - 1, this.cursor.r + m[0])), c: Math.max(0, Math.min(l.cols - 1, this.cursor.c + m[1])) };
      this.render();
      return true;
    }
    if (e.key === ' ' || e.key === 'Enter') {
      this.open(this.cursor.r, this.cursor.c);
      return true;
    }
    if (e.key.toLowerCase() === 'f') {
      this.flag(this.cursor.r, this.cursor.c);
      return true;
    }
    return false;
  }

  protected view() {
    const l = LEVELS[this.level];
    const b = this.board;
    const cells: string[] = [];
    for (let r = 0; r < b.rows; r++)
      for (let c = 0; c < b.cols; c++) {
        const cell = b.cells[r]![c]!;
        const showMine = cell.mine && (cell.revealed || this.finished);
        let content = '';
        let style = '';
        if (cell.revealed && !cell.mine) {
          style = 'background:#0b1022;';
          if (cell.adjacent) content = `<span style="color:${NUMBER_COLORS[cell.adjacent]}">${cell.adjacent}</span>`;
        } else if (showMine) {
          style = cell.revealed ? 'background:#7f1d1d;' : '';
          content = '✹';
        } else if (cell.flagged) {
          content = '<span style="color:#f97316">⚑</span>';
        }
        const cursor = r === this.cursor.r && c === this.cursor.c ? ' sel' : '';
        const label = cell.revealed ? (cell.adjacent ? `${cell.adjacent} adjacent mines` : 'empty') : cell.flagged ? 'flagged' : 'hidden';
        cells.push(
          `<button type="button" class="pv-cell${cursor}" style="${style}" data-action="cell" data-value="${r},${c}" aria-label="Row ${r + 1}, column ${c + 1}: ${label}">${content}</button>`,
        );
      }
    const levels = (Object.keys(LEVELS) as Level[])
      .map((k) => `<button type="button" class="pv-btn small${k === this.level ? ' primary' : ''}" data-action="level" data-value="${k}" ${b.generated ? 'disabled' : ''}>${k[0]!.toUpperCase() + k.slice(1)}</button>`)
      .join('');
    const width = b.cols > 16 ? 900 : b.cols > 9 ? 560 : 380;
    return `
      <div class="pv-row">${levels}</div>
      <div class="pv-hud"><span>Mines <b>${l.mines - flagsPlaced(b)}</b></span><span>Time <b>${formatTime(this.elapsed)}</b></span>
        <button type="button" class="pv-btn small${this.flagMode ? ' primary' : ''}" data-action="mode" data-value="flag" aria-pressed="${this.flagMode}">⚑ Flag mode</button></div>
      <div class="pv-grid" style="--cols:${b.cols};--w:${width}px;--gap:2px;--r:4px;--fs:clamp(10px,2.4vmin,18px);min-width:${b.cols * 22}px">${cells.join('')}</div>
      <p class="pv-muted">Click to reveal · right-click or Flag mode to flag · click a number to clear around it · arrows + Space/F on keyboard</p>`;
  }
}

export default defineGame(
  {
    key: 'minesweeper',
    engine: 'DOM',
    aspectRatio: 1,
    maxScore: 20_000,
    controls: [
      { action: 'Reveal', keys: 'Click / Space' },
      { action: 'Flag', keys: 'Right-click / F / Flag mode' },
      { action: 'Move cursor', keys: 'Arrow keys' },
    ],
  },
  (host) => new Minesweeper(host),
);
