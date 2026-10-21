import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { keyboardHtml, keyFromEvent } from '../../kit/keyboard';
import { esc, pick } from '../../kit/util';
import { ALL_WORDS, DICTIONARY } from '../../kit/words';

const TURN_SECONDS = 12;

class WordChain extends DomGame {
  private chain: string[] = [];
  private input = '';
  private turnStart = 0;
  private message = '';
  private shownTenth = -1;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    // Start with a word whose last letter has plenty of follow-ups.
    const starters = ALL_WORDS.filter((w) => w.length >= 4 && 'tsrlnedp'.includes(w.at(-1)!));
    this.chain = [pick(this.random, starters)];
    this.input = '';
    this.turnStart = 0;
    this.message = 'Each word must start with the last letter of the previous one.';
  }

  private get letter() {
    return this.chain.at(-1)!.at(-1)!;
  }

  private get remaining() {
    return Math.max(0, TURN_SECONDS - (this.elapsed - this.turnStart));
  }

  protected override onTick() {
    if (this.remaining <= 0) {
      this.message = `Time's up! Your chain reached ${this.chain.length - 1} words.`;
      this.end('completed', { words: this.chain.length - 1 });
      return;
    }
    const t = Math.ceil(this.remaining * 2);
    if (t !== this.shownTenth) {
      this.shownTenth = t;
      this.render();
    }
  }

  private submit() {
    const w = this.input;
    this.input = '';
    if (w.length < 3) this.message = 'Use at least 3 letters.';
    else if (w[0] !== this.letter) this.message = `Start with “${this.letter.toUpperCase()}”.`;
    else if (this.chain.includes(w)) this.message = 'That word was already used.';
    else if (!DICTIONARY.has(w)) this.message = `“${w.toUpperCase()}” isn't in our word list.`;
    else {
      this.chain.push(w);
      // Faster answers and longer words score more.
      this.addScore(w.length * 10 + Math.ceil(this.remaining) * 2);
      this.turnStart = this.elapsed;
      this.message = '';
      this.sfx.good();
      return this.render();
    }
    this.sfx.bad();
    this.render();
  }

  private key(k: string) {
    if (k === 'enter') return this.submit();
    if (k === 'back') this.input = this.input.slice(0, -1);
    else if (this.input.length < 12) this.input += k;
    this.render();
  }

  protected override onAction(action: string, value: string) {
    if (action === 'key') this.key(value);
  }

  protected override onKey(e: KeyboardEvent) {
    const k = keyFromEvent(e);
    if (!k) return false;
    this.key(k);
    return true;
  }

  protected view() {
    const recent = this.chain.slice(-6).map((w, i, arr) => `<span style="opacity:${0.4 + (i / arr.length) * 0.6}">${esc(w)}</span>`).join(' → ');
    return `
      <div class="pv-hud"><span>Chain <b>${this.chain.length - 1}</b></span><span>Score <b>${this.score}</b></span></div>
      <div class="pv-meter" aria-hidden="true"><i style="width:${(this.remaining / TURN_SECONDS) * 100}%;${this.remaining < 4 ? 'background:#f43f5e' : ''}"></i></div>
      <p class="pv-muted">${recent}</p>
      <div class="pv-big">Next word starts with <span style="color:#facc15">${this.letter.toUpperCase()}</span></div>
      <div class="pv-panel" style="min-width:240px;text-align:center;font-size:28px;font-weight:800;letter-spacing:3px">${esc(this.input.toUpperCase()) || '&nbsp;'}</div>
      <p class="pv-msg" role="status">${esc(this.message)}</p>
      ${keyboardHtml({}, { enter: true, back: true })}`;
  }
}

export default defineGame(
  { key: 'word-chain', engine: 'DOM', aspectRatio: 0.8, maxScore: 50_000, controls: [{ action: 'Answer', keys: 'Type a word + Enter' }] },
  (host) => new WordChain(host),
);
