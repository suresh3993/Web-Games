import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { keyFromEvent } from '../../kit/keyboard';
import { esc, shuffle } from '../../kit/util';
import { ALL_WORDS, WORDS_BY_LENGTH } from '../../kit/words';

const ROUND_SECONDS = 90;
const ROUNDS = 3;

/** Words (≥3 letters) that can be spelled from the letters of `base`. */
export function subWords(base: string): string[] {
  const counts: Record<string, number> = {};
  for (const ch of base) counts[ch] = (counts[ch] ?? 0) + 1;
  return ALL_WORDS.filter((w) => {
    if (w.length < 3 || w.length > base.length) return false;
    const c: Record<string, number> = {};
    for (const ch of w) {
      c[ch] = (c[ch] ?? 0) + 1;
      if (c[ch]! > (counts[ch] ?? 0)) return false;
    }
    return true;
  });
}

class AnagramScramble extends DomGame {
  private base = '';
  private letters: string[] = [];
  private picked: number[] = [];
  private answers: string[] = [];
  private found: string[] = [];
  private round = 1;
  private roundStart = 0;
  private message = '';
  private shownSecond = -1;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.round = 1;
    this.newRound();
  }

  private newRound() {
    let base = '';
    let answers: string[] = [];
    while (answers.length < 8) {
      base = WORDS_BY_LENGTH[6]![Math.floor(this.random() * WORDS_BY_LENGTH[6]!.length)]!;
      answers = subWords(base);
    }
    this.base = base;
    this.answers = answers;
    this.letters = shuffle(this.random, [...base]);
    this.picked = [];
    this.found = [];
    this.roundStart = this.elapsed;
    this.message = `Round ${this.round}: find words of 3+ letters. Find the 6-letter word to finish early!`;
  }

  private get remaining() {
    return Math.max(0, ROUND_SECONDS - (this.elapsed - this.roundStart));
  }

  protected override onTick() {
    if (this.remaining <= 0) return this.nextRound(false);
    const s = Math.ceil(this.remaining);
    if (s !== this.shownSecond) {
      this.shownSecond = s;
      this.render();
    }
  }

  private nextRound(solved: boolean) {
    if (solved) this.addScore(Math.ceil(this.remaining) * 5);
    if (this.round >= ROUNDS) {
      this.message = `Game over! The last word was ${this.base.toUpperCase()}.`;
      this.end('completed', { found: this.found.length });
      return;
    }
    this.round++;
    this.newRound();
    this.render();
  }

  private submit() {
    const word = this.picked.map((i) => this.letters[i]).join('');
    this.picked = [];
    if (word.length < 3) this.message = 'Words need at least 3 letters.';
    else if (this.found.includes(word)) this.message = 'Already found!';
    else if (!this.answers.includes(word)) {
      this.message = `“${word.toUpperCase()}” isn't in our word list.`;
      this.sfx.bad();
    } else {
      this.found.push(word);
      const pts = [0, 0, 0, 30, 50, 80, 150][word.length]!;
      this.addScore(pts);
      this.sfx.good();
      this.message = `+${pts} ${word.toUpperCase()}`;
      if (word.length === 6) return this.nextRound(true);
    }
    this.render();
  }

  private pickLetter(ch: string) {
    const i = this.letters.findIndex((l, k) => l === ch && !this.picked.includes(k));
    if (i >= 0) this.picked.push(i);
  }

  protected override onAction(action: string, value: string) {
    if (action === 'tile') {
      const i = Number(value);
      if (!this.picked.includes(i)) this.picked.push(i);
    } else if (action === 'back') this.picked.pop();
    else if (action === 'shuffle') {
      this.letters = shuffle(this.random, this.letters);
      this.picked = [];
    } else if (action === 'submit') return this.submit();
    this.render();
  }

  protected override onKey(e: KeyboardEvent) {
    const k = keyFromEvent(e);
    if (!k) return false;
    if (k === 'enter') {
      this.submit();
      return true;
    }
    if (k === 'back') this.picked.pop();
    else this.pickLetter(k);
    this.render();
    return true;
  }

  protected view() {
    const word = this.picked.map((i) => this.letters[i]).join('');
    const tiles = this.letters
      .map((ch, i) => `<button type="button" class="pv-cell" style="width:54px;font-size:26px;${this.picked.includes(i) ? 'opacity:.3' : ''}" data-action="tile" data-value="${i}" ${this.picked.includes(i) ? 'disabled' : ''} aria-label="${ch.toUpperCase()}">${ch.toUpperCase()}</button>`)
      .join('');
    const byLen = [6, 5, 4, 3].map((len) => {
      const total = this.answers.filter((w) => w.length === len).length;
      const got = this.found.filter((w) => w.length === len);
      return total ? `<div><b>${len} letters</b> ${got.length}/${total}: ${got.map((w) => esc(w.toUpperCase())).join(', ')}</div>` : '';
    }).join('');
    return `
      <div class="pv-hud"><span>Round <b>${this.round}/${ROUNDS}</b></span><span>Time <b>${Math.ceil(this.remaining)}s</b></span><span>Score <b>${this.score}</b></span></div>
      <p class="pv-msg" role="status">${this.message}</p>
      <div class="pv-panel" style="min-width:260px;min-height:52px;text-align:center;font-size:28px;font-weight:800;letter-spacing:4px">${esc(word.toUpperCase()) || '&nbsp;'}</div>
      <div class="pv-row" style="flex-wrap:nowrap">${tiles}</div>
      <div class="pv-row"><button type="button" class="pv-btn" data-action="back" data-value="">⌫</button><button type="button" class="pv-btn" data-action="shuffle" data-value="">⤨ Shuffle</button><button type="button" class="pv-btn primary" data-action="submit" data-value="">Submit</button></div>
      <div class="pv-panel" style="width:min(100%,520px);font-size:14px">${byLen}</div>`;
  }
}

export default defineGame(
  { key: 'anagram-scramble', engine: 'DOM', aspectRatio: 0.85, maxScore: 3 * 3000, controls: [{ action: 'Spell', keys: 'Type or tap letters, Enter to submit' }] },
  (host) => new AnagramScramble(host),
);
