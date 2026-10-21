import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { keyboardHtml, keyFromEvent } from '../../kit/keyboard';
import { formatTime, pick, shuffle } from '../../kit/util';
import { PROVERBS } from '../../kit/words';

const ALPHA = 'abcdefghijklmnopqrstuvwxyz';

/** Random substitution cipher where no letter maps to itself. */
export function makeCipher(random: () => number): Record<string, string> {
  for (;;) {
    const perm = shuffle(random, [...ALPHA]);
    if (perm.every((ch, i) => ch !== ALPHA[i])) return Object.fromEntries([...ALPHA].map((ch, i) => [ch, perm[i]!]));
  }
}

class Cryptogram extends DomGame {
  private plain = '';
  private cipher: Record<string, string> = {};
  private decode: Record<string, string> = {}; // cipher letter → true letter
  private guesses: Record<string, string> = {}; // cipher letter → guess
  private selected = '';
  private hints = 0;
  private shownSecond = -1;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.plain = pick(this.random, PROVERBS).toLowerCase();
    this.cipher = makeCipher(this.random);
    this.decode = Object.fromEntries(Object.entries(this.cipher).map(([p, c]) => [c, p]));
    this.guesses = {};
    this.hints = 0;
    this.selected = this.encrypted.find((ch) => /[a-z]/.test(ch)) ?? '';
  }

  private get encrypted() {
    return [...this.plain].map((ch) => this.cipher[ch] ?? ch);
  }

  protected override onTick() {
    const s = Math.floor(this.elapsed);
    if (s !== this.shownSecond) {
      this.shownSecond = s;
      this.render();
    }
  }

  private solved() {
    return this.encrypted.every((ch) => !/[a-z]/.test(ch) || this.guesses[ch] === this.decode[ch]);
  }

  private nextCipherLetter() {
    const letters = [...new Set(this.encrypted.filter((ch) => /[a-z]/.test(ch)))];
    const start = letters.indexOf(this.selected);
    for (let k = 1; k <= letters.length; k++) {
      const ch = letters[(start + k) % letters.length]!;
      if (!this.guesses[ch]) return ch;
    }
    return this.selected;
  }

  private assign(letter: string) {
    if (!this.selected) return;
    // A plaintext letter can only be used once: clear it elsewhere.
    for (const [c, g] of Object.entries(this.guesses)) if (g === letter) delete this.guesses[c];
    this.guesses[this.selected] = letter;
    this.sfx.click();
    if (this.solved()) {
      this.setScore(Math.max(100, 2000 + Math.max(0, 600 - Math.floor(this.elapsed)) * 2 - this.hints * 250));
      this.sfx.win();
      this.end('won', { hints: this.hints });
      return;
    }
    this.selected = this.nextCipherLetter();
    this.render();
  }

  protected override onAction(action: string, value: string) {
    if (action === 'sym') this.selected = value;
    else if (action === 'key') {
      if (value === 'back') delete this.guesses[this.selected];
      else if (value !== 'enter') return this.assign(value);
    } else if (action === 'hint') {
      const unsolved = [...new Set(this.encrypted)].filter((ch) => /[a-z]/.test(ch) && this.guesses[ch] !== this.decode[ch]);
      if (unsolved.length) {
        this.hints++;
        this.selected = pick(this.random, unsolved);
        return this.assign(this.decode[this.selected]!);
      }
    }
    this.render();
  }

  protected override onKey(e: KeyboardEvent) {
    const k = keyFromEvent(e);
    if (!k) return false;
    this.onAction('key', k);
    return true;
  }

  protected view() {
    const words = this.plain.split(' ').map((word) => {
      const cells = [...word].map((p) => {
        const c = this.cipher[p];
        if (!c) return `<span style="font-size:22px;font-weight:800">${p}</span>`;
        const g = this.finished ? p : this.guesses[c] ?? '';
        return `<button type="button" data-action="sym" data-value="${c}" aria-label="Cipher ${c.toUpperCase()}${g ? `, guessed ${g.toUpperCase()}` : ''}" style="all:unset;cursor:pointer;display:inline-flex;flex-direction:column;align-items:center;width:28px;border-radius:4px;${c === this.selected ? 'background:#3b2f8f' : ''}">
          <span style="height:26px;font-size:22px;font-weight:800;color:#67e8f9;border-bottom:2px solid #6d4aff;width:22px;text-align:center">${g.toUpperCase()}</span><span style="font-size:12px;color:#9aa0c0">${c.toUpperCase()}</span></button>`;
      });
      return `<span style="display:inline-flex;gap:2px;margin:0 8px 12px 0">${cells.join('')}</span>`;
    });
    const used: Record<string, 'miss'> = {};
    for (const g of Object.values(this.guesses)) used[g] = 'miss';
    return `
      <div class="pv-hud"><span>Time <b>${formatTime(this.elapsed)}</b></span><span>Hints <b>${this.hints}</b></span></div>
      <p class="pv-msg">Each letter stands for another. Select a symbol, then type the letter you think it hides.</p>
      <div class="pv-panel" style="max-width:720px;display:flex;flex-wrap:wrap;justify-content:center">${words.join('')}</div>
      <button type="button" class="pv-btn small" data-action="hint" data-value="">💡 Reveal a letter (−250)</button>
      ${keyboardHtml(used, { back: true })}`;
  }
}

export default defineGame(
  { key: 'cryptogram', engine: 'DOM', aspectRatio: 0.85, maxScore: 3_200, controls: [{ action: 'Decode', keys: 'Click a symbol, type a letter' }] },
  (host) => new Cryptogram(host),
);
