import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { esc, formatTime, pick, shuffle } from '../../kit/util';
import { THEMES } from '../../kit/words';

const N = 12;
const DIRS = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]] as const;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

interface Placed { word: string; cells: number[]; found: boolean }

/** Places words on an N×N grid in 8 directions, filling the rest with random letters. */
export function buildPuzzle(words: string[], random: () => number) {
  const grid: string[] = Array(N * N).fill('');
  const placed: Placed[] = [];
  for (const word of words) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const [dr, dc] = DIRS[Math.floor(random() * DIRS.length)]!;
      const r0 = Math.floor(random() * N);
      const c0 = Math.floor(random() * N);
      const cells: number[] = [];
      let ok = true;
      for (let k = 0; k < word.length; k++) {
        const r = r0 + dr * k;
        const c = c0 + dc * k;
        if (r < 0 || c < 0 || r >= N || c >= N || (grid[r * N + c] && grid[r * N + c] !== word[k])) {
          ok = false;
          break;
        }
        cells.push(r * N + c);
      }
      if (!ok) continue;
      cells.forEach((i, k) => (grid[i] = word[k]!));
      placed.push({ word, cells, found: false });
      break;
    }
  }
  for (let i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = ALPHABET[Math.floor(random() * 26)]!;
  return { grid, placed };
}

class WordSearch extends DomGame {
  private theme = '';
  private grid: string[] = [];
  private words: Placed[] = [];
  private anchor = -1;
  private message = '';
  private shownSecond = -1;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.theme = pick(this.random, Object.keys(THEMES));
    const words = shuffle(this.random, THEMES[this.theme]!.filter((w) => w.length <= N)).slice(0, 8);
    const { grid, placed } = buildPuzzle(words, this.random);
    this.grid = grid;
    this.words = placed;
    this.anchor = -1;
    this.message = 'Tap the first letter of a word, then its last letter.';
  }

  protected override onTick() {
    const s = Math.floor(this.elapsed);
    if (s !== this.shownSecond) {
      this.shownSecond = s;
      this.render();
    }
  }

  private select(i: number) {
    if (this.anchor < 0) {
      this.anchor = i;
      this.render();
      return;
    }
    const a = this.anchor;
    this.anchor = -1;
    const match = this.words.find((w) => !w.found && ((w.cells[0] === a && w.cells.at(-1) === i) || (w.cells[0] === i && w.cells.at(-1) === a)));
    if (match) {
      match.found = true;
      this.addScore(100);
      this.sfx.good();
      this.message = `Found ${match.word.toUpperCase()}!`;
      if (this.words.every((w) => w.found)) {
        this.addScore(Math.max(0, 300 - Math.floor(this.elapsed)) * 3);
        this.sfx.win();
        this.end('won', { seconds: Math.floor(this.elapsed) });
        return;
      }
    } else if (a !== i) {
      this.message = 'Not a word from the list — try again.';
      this.sfx.bad();
    }
    this.render();
  }

  protected override onAction(action: string, value: string) {
    if (action === 'cell') this.select(Number(value));
  }

  protected view() {
    const foundCells = new Set(this.words.filter((w) => w.found || this.finished).flatMap((w) => w.cells));
    const cells = this.grid
      .map(
        (ch, i) =>
          `<button type="button" class="pv-cell${i === this.anchor ? ' sel' : ''}" style="--fs:clamp(12px,3vmin,20px);border-radius:6px;${foundCells.has(i) ? 'background:#4c1d95;color:#fde68a' : ''}" data-action="cell" data-value="${i}" aria-label="${ch.toUpperCase()}">${ch.toUpperCase()}</button>`,
      )
      .join('');
    const list = this.words
      .map((w) => `<span style="${w.found ? 'text-decoration:line-through;color:#4ade80' : ''};font-weight:700">${esc(w.word.toUpperCase())}</span>`)
      .join(' · ');
    return `
      <div class="pv-hud"><span>Theme <b>${esc(this.theme)}</b></span><span>Found <b>${this.words.filter((w) => w.found).length}/${this.words.length}</b></span><span>Time <b>${formatTime(this.elapsed)}</b></span></div>
      <p class="pv-msg" role="status">${esc(this.message)}</p>
      <div class="pv-grid" style="--cols:${N};--gap:3px;--w:520px">${cells}</div>
      <p style="text-align:center;max-width:520px">${list}</p>`;
  }
}

export default defineGame(
  { key: 'word-search', engine: 'DOM', aspectRatio: 0.8, maxScore: 2_000, controls: [{ action: 'Select word', keys: 'Tap first letter, then last letter' }] },
  (host) => new WordSearch(host),
);
