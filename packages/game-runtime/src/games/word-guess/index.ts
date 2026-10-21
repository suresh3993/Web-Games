import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { keyboardHtml, keyFromEvent } from '../../kit/keyboard';
import { esc } from '../../kit/util';
import { DICTIONARY, WORDS_BY_LENGTH } from '../../kit/words';

const TRIES = 6;
type Mark = 'hit' | 'near' | 'miss';

/** Colours a guess, handling repeated letters exactly like the classic rules. */
export function scoreGuess(answer: string, guess: string): Mark[] {
  const marks: Mark[] = Array(guess.length).fill('miss');
  const remaining: Record<string, number> = {};
  [...answer].forEach((ch, i) => {
    if (guess[i] === ch) marks[i] = 'hit';
    else remaining[ch] = (remaining[ch] ?? 0) + 1;
  });
  [...guess].forEach((ch, i) => {
    if (marks[i] !== 'hit' && remaining[ch]) {
      marks[i] = 'near';
      remaining[ch]!--;
    }
  });
  return marks;
}

/** One shared word per UTC day. */
export function dailyIndex(date: Date, size: number) {
  const day = Math.floor(date.getTime() / 86_400_000);
  return ((day * 2654435761) >>> 0) % size;
}

class WordGuess extends DomGame {
  private answer = '';
  private guesses: { word: string; marks: Mark[] }[] = [];
  private current = '';
  private daily = false;
  private message = '';

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    const words = WORDS_BY_LENGTH[5]!;
    this.answer = this.daily ? words[dailyIndex(new Date(), words.length)]! : words[Math.floor(this.random() * words.length)]!;
    this.guesses = [];
    this.current = '';
    this.message = this.daily ? "Today's daily word" : 'Practice round';
  }

  private submit() {
    if (this.current.length !== 5) {
      this.message = 'Not enough letters';
      return this.render();
    }
    if (!DICTIONARY.has(this.current)) {
      this.message = 'Not in the word list';
      this.sfx.bad();
      return this.render();
    }
    const marks = scoreGuess(this.answer, this.current);
    this.guesses.push({ word: this.current, marks });
    this.current = '';
    this.sfx.click();
    if (marks.every((m) => m === 'hit')) {
      this.setScore((TRIES + 1 - this.guesses.length) * 100 + Math.max(0, 180 - Math.floor(this.elapsed)));
      this.message = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'][this.guesses.length - 1]!;
      this.sfx.win();
      this.end('won', { guesses: this.guesses.length });
      return;
    }
    if (this.guesses.length >= TRIES) {
      this.message = `The word was ${this.answer.toUpperCase()}`;
      this.end('lost', { guesses: TRIES });
      return;
    }
    this.message = '';
    this.render();
  }

  private key(k: string) {
    if (k === 'enter') return this.submit();
    if (k === 'back') this.current = this.current.slice(0, -1);
    else if (/^[a-z]$/.test(k) && this.current.length < 5) this.current += k;
    this.render();
  }

  protected override onAction(action: string, value: string) {
    if (action === 'key') this.key(value);
    else if (action === 'mode' && !this.guesses.length) {
      this.daily = value === 'daily';
      this.reset();
      this.render();
    }
  }

  protected override onKey(e: KeyboardEvent) {
    const k = keyFromEvent(e);
    if (!k) return false;
    this.key(k);
    return true;
  }

  protected view() {
    const colors: Record<Mark, string> = { hit: '#15803d', near: '#a16207', miss: '#262c48' };
    const rows = Array.from({ length: TRIES }, (_, r) => {
      const g = this.guesses[r];
      const word = g ? g.word : r === this.guesses.length ? this.current : '';
      return `<div class="pv-row" style="flex-wrap:nowrap;gap:6px">${Array.from({ length: 5 }, (_, i) => {
        const ch = word[i] ?? '';
        const bg = g ? colors[g.marks[i]!] : '#0e1430';
        return `<span style="width:clamp(42px,12vw,58px);aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:clamp(20px,6vw,30px);font-weight:800;border-radius:6px;background:${bg};border:2px solid ${ch && !g ? '#7c86c4' : 'rgba(148,163,255,.2)'}" aria-label="${ch ? ch.toUpperCase() : 'empty'}${g ? ` (${g.marks[i]})` : ''}">${esc(ch.toUpperCase())}</span>`;
      }).join('')}</div>`;
    }).join('');
    const states: Record<string, Mark> = {};
    const rank = { miss: 0, near: 1, hit: 2 };
    for (const g of this.guesses) [...g.word].forEach((ch, i) => {
      const m = g.marks[i]!;
      if (!states[ch] || rank[m] > rank[states[ch]!]) states[ch] = m;
    });
    return `
      <div class="pv-row">
        <button type="button" class="pv-btn small${!this.daily ? ' primary' : ''}" data-action="mode" data-value="practice" ${this.guesses.length ? 'disabled' : ''}>Practice</button>
        <button type="button" class="pv-btn small${this.daily ? ' primary' : ''}" data-action="mode" data-value="daily" ${this.guesses.length ? 'disabled' : ''}>Daily word</button></div>
      <p class="pv-msg" role="status">${esc(this.message)}</p>
      <div class="pv-col" style="gap:6px">${rows}</div>
      ${keyboardHtml(states, { enter: true, back: true })}`;
  }
}

export default defineGame(
  { key: 'word-guess', engine: 'DOM', aspectRatio: 0.7, orientation: 'portrait', maxScore: 800, controls: [{ action: 'Type', keys: 'Keyboard or on-screen keys, Enter to submit' }] },
  (host) => new WordGuess(host),
);
