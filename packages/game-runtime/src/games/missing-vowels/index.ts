import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { keyboardHtml, keyFromEvent } from '../../kit/keyboard';
import { esc, pick, shuffle } from '../../kit/util';
import { THEMES } from '../../kit/words';

const SECONDS = 90;

/** Removes vowels and regroups the consonants into chunks so word lengths don't give it away. */
export function disguise(answer: string, random: () => number): string {
  const consonants = [...answer.replace(/[aeiou\s]/g, '')];
  const out: string[] = [];
  let k = 0;
  while (k < consonants.length) {
    const size = 2 + Math.floor(random() * 3);
    out.push(consonants.slice(k, k + size).join(''));
    k += size;
  }
  return out.join(' ').toUpperCase();
}

class MissingVowels extends DomGame {
  private theme = '';
  private answer = '';
  private clue = '';
  private input = '';
  private solved = 0;
  private message = '';
  private queue: { theme: string; word: string }[] = [];
  private shownSecond = -1;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.queue = shuffle(
      this.random,
      Object.entries(THEMES).flatMap(([theme, words]) => words.filter((w) => w.replace(/[aeiou]/g, '').length >= 3).map((word) => ({ theme, word }))),
    );
    this.solved = 0;
    this.next();
    this.message = 'Type the full word. Vowels and spaces have been removed.';
  }

  private next() {
    const item = this.queue.pop() ?? { theme: 'Animals', word: pick(this.random, THEMES.Animals!) };
    this.theme = item.theme;
    this.answer = item.word;
    this.clue = disguise(item.word, this.random);
    this.input = '';
    this.questionStart = this.elapsed;
  }
  private questionStart = 0;

  private get remaining() {
    return Math.max(0, SECONDS - this.elapsed);
  }

  protected override onTick() {
    if (this.remaining <= 0) {
      this.message = `Time! The last answer was ${this.answer.toUpperCase()}.`;
      this.end('completed', { solved: this.solved });
      return;
    }
    const s = Math.ceil(this.remaining);
    if (s !== this.shownSecond) {
      this.shownSecond = s;
      this.render();
    }
  }

  private submit() {
    if (this.input === this.answer) {
      this.solved++;
      const quick = Math.max(0, 15 - Math.floor(this.elapsed - this.questionStart));
      this.addScore(100 + quick * 10);
      this.message = `Correct: ${this.answer.toUpperCase()}!`;
      this.sfx.good();
      this.next();
    } else {
      this.message = 'Not quite — try again or skip.';
      this.sfx.bad();
      this.input = '';
    }
    this.render();
  }

  private key(k: string) {
    if (k === 'enter') return this.submit();
    if (k === 'back') this.input = this.input.slice(0, -1);
    else if (this.input.length < 14) this.input += k;
    this.render();
  }

  protected override onAction(action: string, value: string) {
    if (action === 'key') this.key(value);
    else if (action === 'skip') {
      this.message = `Skipped: ${this.answer.toUpperCase()}`;
      this.next();
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
    return `
      <div class="pv-hud"><span>Time <b>${Math.ceil(this.remaining)}s</b></span><span>Solved <b>${this.solved}</b></span><span>Score <b>${this.score}</b></span></div>
      <p class="pv-muted">Theme: <b>${esc(this.theme)}</b></p>
      <div class="pv-big" style="letter-spacing:6px">${esc(this.clue)}</div>
      <div class="pv-panel" style="min-width:240px;text-align:center;font-size:26px;font-weight:800;letter-spacing:3px">${esc(this.input.toUpperCase()) || '&nbsp;'}</div>
      <p class="pv-msg" role="status">${esc(this.message)}</p>
      <button type="button" class="pv-btn small" data-action="skip" data-value="">Skip</button>
      ${keyboardHtml({}, { enter: true, back: true })}`;
  }
}

export default defineGame(
  { key: 'missing-vowels', engine: 'DOM', aspectRatio: 0.8, maxScore: 30 * 250, controls: [{ action: 'Answer', keys: 'Type the word + Enter' }] },
  (host) => new MissingVowels(host),
);
