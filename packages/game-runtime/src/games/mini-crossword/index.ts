import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { keyboardHtml, keyFromEvent } from '../../kit/keyboard';
import { esc, formatTime } from '../../kit/util';
import { buildCrossword, type Entry } from './logic';

class MiniCrossword extends DomGame {
  private entries: Entry[] = [];
  private rows = 0;
  private cols = 0;
  private solution = new Map<number, string>();
  private letters = new Map<number, string>();
  private cursor = 0;
  private across = true;
  private checked = false;
  private reveals = 0;
  private shownSecond = -1;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    const { entries, rows, cols } = buildCrossword(this.random);
    this.entries = entries;
    this.rows = rows;
    this.cols = cols;
    this.solution.clear();
    for (const e of entries) [...e.word].forEach((ch, k) => this.solution.set((e.r + (e.across ? 0 : k)) * cols + e.c + (e.across ? k : 0), ch));
    this.letters.clear();
    this.cursor = [...this.solution.keys()].sort((a, b) => a - b)[0]!;
    this.across = true;
    this.checked = false;
    this.reveals = 0;
  }

  protected override onTick() {
    const s = Math.floor(this.elapsed);
    if (s !== this.shownSecond) {
      this.shownSecond = s;
      this.render();
    }
  }

  private currentEntry(): Entry | undefined {
    const r = Math.floor(this.cursor / this.cols);
    const c = this.cursor % this.cols;
    const covers = (e: Entry) => (e.across ? e.r === r && c >= e.c && c < e.c + e.word.length : e.c === c && r >= e.r && r < e.r + e.word.length);
    return this.entries.find((e) => e.across === this.across && covers(e)) ?? this.entries.find(covers);
  }

  private advance(step: number) {
    const dir = this.across ? 1 : this.cols;
    const next = this.cursor + dir * step;
    if (this.solution.has(next)) this.cursor = next;
  }

  private type(ch: string) {
    if (!this.solution.has(this.cursor)) return;
    this.letters.set(this.cursor, ch);
    this.checked = false;
    this.advance(1);
    if ([...this.solution].every(([i, l]) => this.letters.get(i) === l)) {
      this.setScore(Math.max(200, 1500 + Math.max(0, 480 - Math.floor(this.elapsed)) * 2 - this.reveals * 150));
      this.sfx.win();
      this.end('won', { seconds: Math.floor(this.elapsed) });
      return;
    }
    this.render();
  }

  protected override onAction(action: string, value: string) {
    if (action === 'cell') {
      const i = Number(value);
      if (i === this.cursor) this.across = !this.across;
      this.cursor = i;
      const e = this.currentEntry();
      if (e) this.across = e.across;
    } else if (action === 'clue') {
      const e = this.entries[Number(value)]!;
      this.across = e.across;
      this.cursor = e.r * this.cols + e.c;
    } else if (action === 'key') {
      if (value === 'back') {
        this.letters.delete(this.cursor);
        this.advance(-1);
      } else if (value !== 'enter') return this.type(value);
    } else if (action === 'check') this.checked = true;
    else if (action === 'reveal') {
      this.reveals++;
      return this.type(this.solution.get(this.cursor)!);
    }
    this.render();
  }

  protected override onKey(e: KeyboardEvent) {
    const moves: Record<string, [number, boolean]> = { ArrowRight: [1, true], ArrowLeft: [-1, true], ArrowDown: [1, false], ArrowUp: [-1, false] };
    if (e.key in moves) {
      const [step, across] = moves[e.key]!;
      this.across = across;
      this.advance(step);
      this.render();
      return true;
    }
    if (e.key === 'Tab') {
      this.across = !this.across;
      this.render();
      return true;
    }
    const k = keyFromEvent(e);
    if (!k) return false;
    this.onAction('key', k);
    return true;
  }

  protected view() {
    const current = this.currentEntry();
    const inCurrent = new Set<number>();
    if (current) for (let k = 0; k < current.word.length; k++) inCurrent.add((current.r + (current.across ? 0 : k)) * this.cols + current.c + (current.across ? k : 0));
    const numbers = new Map(this.entries.map((e) => [e.r * this.cols + e.c, e.number]));
    const cells = Array.from({ length: this.rows * this.cols }, (_, i) => {
      if (!this.solution.has(i)) return '<div style="background:transparent"></div>';
      const ch = this.letters.get(i) ?? '';
      const wrong = this.checked && ch && ch !== this.solution.get(i);
      const bg = i === this.cursor ? '#fde047' : inCurrent.has(i) ? '#bfdbfe' : '#f8fafc';
      return `<button type="button" class="pv-cell" style="border-radius:0;background:${bg};color:${wrong ? '#dc2626' : '#0f172a'};border:1px solid #334155;position:relative" data-action="cell" data-value="${i}" aria-label="Square${numbers.get(i) ? ` ${numbers.get(i)}` : ''}${ch ? `: ${ch}` : ''}">
        ${numbers.has(i) ? `<span style="position:absolute;left:2px;top:0;font-size:9px;color:#475569">${numbers.get(i)}</span>` : ''}${esc((this.finished ? this.solution.get(i)! : ch).toUpperCase())}</button>`;
    }).join('');
    const clueList = (across: boolean) =>
      this.entries
        .map((e, k) => ({ e, k }))
        .filter(({ e }) => e.across === across)
        .sort((a, b) => a.e.number - b.e.number)
        .map(({ e, k }) => `<button type="button" data-action="clue" data-value="${k}" style="all:unset;cursor:pointer;display:block;padding:2px 4px;border-radius:4px;${e === current ? 'background:#1e2a66' : ''}"><b>${e.number}.</b> ${esc(e.clue)} (${e.word.length})</button>`)
        .join('');
    return `
      <div class="pv-hud"><span>Time <b>${formatTime(this.elapsed)}</b></span><span>Reveals <b>${this.reveals}</b></span></div>
      ${current ? `<p class="pv-msg">${current.number} ${current.across ? 'Across' : 'Down'}: ${esc(current.clue)}</p>` : ''}
      <div class="pv-grid" style="--cols:${this.cols};--gap:0px;--w:${this.cols * 46}px">${cells}</div>
      <div class="pv-row" style="align-items:flex-start;gap:16px;font-size:14px">
        <div class="pv-panel" style="min-width:200px"><b>Across</b>${clueList(true)}</div>
        <div class="pv-panel" style="min-width:200px"><b>Down</b>${clueList(false)}</div></div>
      <div class="pv-row"><button type="button" class="pv-btn small" data-action="check" data-value="">✓ Check</button><button type="button" class="pv-btn small" data-action="reveal" data-value="">Reveal letter (−150)</button></div>
      ${keyboardHtml({}, { back: true })}`;
  }
}

export default defineGame(
  { key: 'mini-crossword', engine: 'DOM', aspectRatio: 0.65, maxScore: 2_500, controls: [{ action: 'Type', keys: 'Letters · arrows move · Tab switches direction' }] },
  (host) => new MiniCrossword(host),
);
