import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { esc } from '../../kit/util';
import { DICTIONARY } from '../../kit/words';

const N = 4;
const SECONDS = 180;
// Letter weights roughly following English frequency (no Q to avoid dead boards).
const BAG = 'eeeeeeeeeeeaaaaaaaaiiiiiiioooooootttttttnnnnnnsssssssrrrrrrhhhhlllllddddcccuuuummmpppggyybbwfkv';
const POINTS: Record<number, number> = { 3: 10, 4: 10, 5: 20, 6: 30, 7: 50, 8: 110 };

export const adjacentCells = (a: number, b: number) => a !== b && Math.abs(Math.floor(a / N) - Math.floor(b / N)) <= 1 && Math.abs((a % N) - (b % N)) <= 1;

/** All dictionary words that can be traced on the grid (for end-of-game reveal and board quality). */
export function findAllWords(grid: string[]): string[] {
  const found = new Set<string>();
  const prefixes = new Set<string>();
  for (const w of DICTIONARY) for (let k = 1; k <= w.length; k++) prefixes.add(w.slice(0, k));
  const walk = (i: number, word: string, used: Set<number>) => {
    const next = word + grid[i];
    if (!prefixes.has(next)) return;
    if (next.length >= 3 && DICTIONARY.has(next)) found.add(next);
    used.add(i);
    for (let j = 0; j < N * N; j++) if (!used.has(j) && adjacentCells(i, j)) walk(j, next, used);
    used.delete(i);
  };
  for (let i = 0; i < N * N; i++) walk(i, '', new Set());
  return [...found].sort((a, b) => b.length - a.length || a.localeCompare(b));
}

class LetterGrid extends DomGame {
  private grid: string[] = [];
  private path: number[] = [];
  private found: string[] = [];
  private all: string[] = [];
  private message = '';
  private shownSecond = -1;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    do {
      this.grid = Array.from({ length: N * N }, () => BAG[Math.floor(this.random() * BAG.length)]!);
      this.all = findAllWords(this.grid);
    } while (this.all.length < 15);
    this.path = [];
    this.found = [];
    this.message = 'Click neighbouring letters (diagonals count) to build a word, then Submit.';
  }

  private get remaining() {
    return Math.max(0, SECONDS - this.elapsed);
  }

  protected override onTick() {
    if (this.remaining <= 0) {
      this.message = `Time! You found ${this.found.length} of ${this.all.length} possible words.`;
      this.end('completed', { found: this.found.length });
      return;
    }
    const s = Math.ceil(this.remaining);
    if (s !== this.shownSecond) {
      this.shownSecond = s;
      this.render();
    }
  }

  private submit() {
    const word = this.path.map((i) => this.grid[i]).join('');
    this.path = [];
    if (word.length < 3) this.message = 'Words need 3+ letters.';
    else if (this.found.includes(word)) this.message = 'Already found.';
    else if (!DICTIONARY.has(word)) {
      this.message = `“${word.toUpperCase()}” isn't in our word list.`;
      this.sfx.bad();
    } else {
      this.found.push(word);
      const pts = POINTS[Math.min(8, word.length)]!;
      this.addScore(pts);
      this.message = `+${pts} ${word.toUpperCase()}`;
      this.sfx.good();
    }
    this.render();
  }

  protected override onAction(action: string, value: string) {
    if (action === 'cell') {
      const i = Number(value);
      const last = this.path.at(-1);
      if (this.path.includes(i)) this.path = this.path.slice(0, this.path.indexOf(i) + 1);
      else if (last === undefined || adjacentCells(last, i)) this.path.push(i);
      else this.path = [i];
      this.sfx.click();
    } else if (action === 'clear') this.path = [];
    else if (action === 'submit') return this.submit();
    this.render();
  }

  protected override onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      this.submit();
      return true;
    }
    if (e.key === 'Escape' || e.key === 'Backspace') {
      this.path = e.key === 'Backspace' ? this.path.slice(0, -1) : [];
      this.render();
      return true;
    }
    return false;
  }

  protected view() {
    const cells = this.grid
      .map((ch, i) => {
        const on = this.path.indexOf(i);
        return `<button type="button" class="pv-cell" style="font-size:clamp(22px,7vmin,40px);${on >= 0 ? `background:#6d4aff;color:#fff` : ''}" data-action="cell" data-value="${i}" aria-label="${ch.toUpperCase()}${on >= 0 ? ` (letter ${on + 1})` : ''}">${ch.toUpperCase()}</button>`;
      })
      .join('');
    const word = this.path.map((i) => this.grid[i]).join('');
    const list = (this.finished ? this.all : this.found).map((w) => `<span style="${this.found.includes(w) ? 'color:#4ade80;font-weight:700' : 'color:#7d84a8'}">${esc(w)}</span>`).join(' ');
    return `
      <div class="pv-hud"><span>Time <b>${Math.ceil(this.remaining)}s</b></span><span>Words <b>${this.found.length}</b></span><span>Score <b>${this.score}</b></span></div>
      <p class="pv-msg" role="status">${esc(this.message)}</p>
      <div class="pv-grid" style="--cols:${N};--gap:8px;--w:340px">${cells}</div>
      <div class="pv-panel" style="min-width:220px;text-align:center;font-size:24px;font-weight:800;letter-spacing:3px">${esc(word.toUpperCase()) || '&nbsp;'}</div>
      <div class="pv-row"><button type="button" class="pv-btn" data-action="clear" data-value="">Clear</button><button type="button" class="pv-btn primary" data-action="submit" data-value="">Submit</button></div>
      <div class="pv-panel" style="width:min(100%,520px);font-size:14px;line-height:1.7">${list || '<span class="pv-muted">Found words appear here</span>'}</div>`;
  }
}

export default defineGame(
  { key: 'letter-grid', engine: 'DOM', aspectRatio: 0.8, maxScore: 10_000, controls: [{ action: 'Trace word', keys: 'Click adjacent letters, Enter to submit' }] },
  (host) => new LetterGrid(host),
);
