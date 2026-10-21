import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { keyboardHtml, keyFromEvent } from '../../kit/keyboard';
import { esc, pick } from '../../kit/util';
import { THEMES } from '../../kit/words';

const LIVES = 6;

class Hangman extends DomGame {
  private theme = '';
  private word = '';
  private guessed = new Set<string>();
  private misses = 0;
  private solved = 0;
  private hintUsed = false;
  private message = '';
  private waiting = false;
  private used = new Set<string>();

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.solved = 0;
    this.used.clear();
    this.newWord();
  }

  private newWord() {
    this.theme = pick(this.random, Object.keys(THEMES));
    const options = THEMES[this.theme]!.filter((w) => !this.used.has(w));
    this.word = pick(this.random, options.length ? options : THEMES[this.theme]!);
    this.used.add(this.word);
    this.guessed = new Set();
    this.misses = 0;
    this.hintUsed = false;
    this.waiting = false;
    this.message = `Theme: ${this.theme}`;
  }

  private get revealed() {
    return [...this.word].every((ch) => this.guessed.has(ch));
  }

  private guess(letter: string) {
    if (this.waiting || this.guessed.has(letter)) return;
    this.guessed.add(letter);
    if (!this.word.includes(letter)) {
      this.misses++;
      this.sfx.bad();
      if (this.misses >= LIVES) {
        this.message = `Out of lights! The word was “${this.word.toUpperCase()}”.`;
        this.end('completed', { words: this.solved });
        return;
      }
    } else this.sfx.good();
    if (this.revealed) {
      this.solved++;
      this.addScore(100 + (LIVES - this.misses) * 20 - (this.hintUsed ? 40 : 0));
      this.message = `Solved “${this.word.toUpperCase()}”! Next word coming up…`;
      this.waiting = true;
      this.schedule(1200, () => {
        this.newWord();
        this.render();
      });
    }
    this.render();
  }

  private hint() {
    if (this.hintUsed || this.misses < 3 || this.waiting) return;
    const hidden = [...new Set(this.word)].filter((ch) => !this.guessed.has(ch));
    if (!hidden.length) return;
    this.hintUsed = true;
    this.guess(pick(this.random, hidden));
  }

  protected override onAction(action: string, value: string) {
    if (action === 'key') this.guess(value);
    if (action === 'hint') this.hint();
  }

  protected override onKey(e: KeyboardEvent) {
    const k = keyFromEvent(e);
    if (!k || k.length !== 1) return false;
    this.guess(k);
    return true;
  }

  protected view() {
    const letters = [...this.word]
      .map((ch) => `<span style="display:inline-flex;width:clamp(22px,6vmin,40px);justify-content:center;border-bottom:3px solid #6d4aff;font-size:clamp(20px,5vmin,34px);font-weight:800">${this.guessed.has(ch) || this.finished ? esc(ch.toUpperCase()) : '&nbsp;'}</span>`)
      .join('');
    const lights = Array.from({ length: LIVES }, (_, i) => `<span style="width:18px;height:18px;border-radius:50%;background:${i < LIVES - this.misses ? '#facc15' : '#262c48'};box-shadow:${i < LIVES - this.misses ? '0 0 10px #facc15' : 'none'}"></span>`).join('');
    const states: Record<string, 'hit' | 'miss'> = {};
    for (const g of this.guessed) states[g] = this.word.includes(g) ? 'hit' : 'miss';
    return `
      <div class="pv-hud"><span>Words <b>${this.solved}</b></span><span>Score <b>${this.score}</b></span></div>
      <div class="pv-row" aria-label="${LIVES - this.misses} lights left">${lights}</div>
      <p class="pv-msg" role="status">${esc(this.message)}</p>
      <div class="pv-row" style="gap:8px">${letters}</div>
      ${keyboardHtml(states, { disabled: this.guessed })}
      <button type="button" class="pv-btn small" data-action="hint" data-value="" ${this.misses < 3 || this.hintUsed ? 'disabled' : ''}>💡 Hint (after 3 misses)</button>`;
  }
}

export default defineGame(
  { key: 'hangman', engine: 'DOM', aspectRatio: 0.95, maxScore: 50_000, controls: [{ action: 'Guess', keys: 'Type a letter / tap keys' }] },
  (host) => new Hangman(host),
);
