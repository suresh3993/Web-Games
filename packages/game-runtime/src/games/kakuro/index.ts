import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { formatTime } from '../../kit/util';
import { checkKakuro, generateKakuro, runs, type KakuroPuzzle } from './logic';

class Kakuro extends DomGame {
  private puzzle!: KakuroPuzzle;
  private values: number[] = [];
  private selected = -1;
  private shownSecond = -1;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.puzzle = generateKakuro(7, this.random);
    this.values = Array(49).fill(0);
    this.selected = this.puzzle.white.indexOf(true);
  }

  protected override onTick() {
    const s = Math.floor(this.elapsed);
    if (s !== this.shownSecond) {
      this.shownSecond = s;
      this.render();
    }
  }

  private enter(d: number) {
    if (this.selected < 0 || !this.puzzle.white[this.selected]) return;
    this.values[this.selected] = d;
    this.sfx.click();
    if (checkKakuro(this.puzzle, this.values)) {
      this.setScore(2500 + Math.max(0, 1200 - Math.floor(this.elapsed)) * 2);
      this.sfx.win();
      this.end('won', { seconds: Math.floor(this.elapsed) });
      return;
    }
    this.render();
  }

  /** Runs containing the cell where digits repeat or the full sum is wrong. */
  private badCells(): Set<number> {
    const bad = new Set<number>();
    for (const horizontal of [true, false])
      for (const run of runs(this.puzzle.white, 7, horizontal)) {
        const digits = run.map((i) => this.values[i]!).filter(Boolean);
        const clue = horizontal ? this.puzzle.across[run[0]! - 1] : this.puzzle.down[run[0]! - 7];
        const sum = digits.reduce((a, b) => a + b, 0);
        if (new Set(digits).size !== digits.length || sum > clue! || (digits.length === run.length && sum !== clue)) run.forEach((i) => bad.add(i));
      }
    return bad;
  }

  protected override onAction(action: string, value: string) {
    if (action === 'cell') this.selected = Number(value);
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
    const moves: Record<string, number> = { ArrowUp: -7, ArrowDown: 7, ArrowLeft: -1, ArrowRight: 1 };
    if (e.key in moves) {
      let next = this.selected + moves[e.key]!;
      while (next >= 0 && next < 49 && !this.puzzle.white[next]) next += moves[e.key]!;
      if (next >= 0 && next < 49) this.selected = next;
      this.render();
      return true;
    }
    return false;
  }

  protected view() {
    const p = this.puzzle;
    const bad = this.badCells();
    const cells = p.white
      .map((w, i) => {
        if (!w) {
          const a = p.across[i];
          const d = p.down[i];
          const diag = a !== null || d !== null ? 'background:linear-gradient(to top right,#1b2350 calc(50% - 1px),#6d4aff,#1b2350 calc(50% + 1px))' : 'background:#0b1022';
          return `<div class="pv-cell" style="border-radius:0;${diag};position:relative;font-size:clamp(9px,2vmin,13px);color:#c4b5fd">
            ${d !== null ? `<span style="position:absolute;left:12%;bottom:8%">${d}</span>` : ''}${a !== null ? `<span style="position:absolute;right:10%;top:8%">${a}</span>` : ''}</div>`;
        }
        const v = this.values[i];
        return `<button type="button" class="pv-cell${i === this.selected ? ' sel' : ''}" style="border-radius:0;background:#e0e7ff;color:${bad.has(i) ? '#dc2626' : '#1e1b4b'}" data-action="cell" data-value="${i}" aria-label="Cell ${i + 1}${v ? `: ${v}` : ''}">${v || ''}</button>`;
      })
      .join('');
    const pad = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d) => `<button type="button" class="pv-btn" style="min-width:40px" data-action="digit" data-value="${d}">${d || '⌫'}</button>`).join('');
    return `
      <div class="pv-hud"><span>Time <b>${formatTime(this.elapsed)}</b></span></div>
      <div class="pv-grid" style="--cols:7;--gap:2px;--w:440px">${cells}</div>
      <div class="pv-row">${pad}</div>
      <p class="pv-muted">Clue above the diagonal = sum to the right · below = sum downward. No digit repeats within a run.</p>`;
  }
}

export default defineGame(
  { key: 'kakuro', engine: 'DOM', aspectRatio: 0.85, maxScore: 5_000, controls: [{ action: 'Fill', keys: 'Click a cell, then 1–9' }] },
  (host) => new Kakuro(host),
);
