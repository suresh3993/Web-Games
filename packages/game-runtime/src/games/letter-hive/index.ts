import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { keyFromEvent } from '../../kit/keyboard';
import { esc, shuffle } from '../../kit/util';
import { ALL_WORDS } from '../../kit/words';

const SECONDS = 240;

/** Valid answers: 4+ letters, only hive letters, always containing the centre letter. */
export function hiveAnswers(letters: string[], centre: string): string[] {
  const set = new Set(letters);
  return ALL_WORDS.filter((w) => w.length >= 4 && w.includes(centre) && [...w].every((ch) => set.has(ch)));
}

export const isPangram = (word: string, letters: string[]) => letters.every((l) => word.includes(l));
export const hivePoints = (word: string, letters: string[]) => (word.length === 4 ? 1 : word.length) + (isPangram(word, letters) ? 7 : 0);

class LetterHive extends DomGame {
  private letters: string[] = [];
  private centre = '';
  private answers: string[] = [];
  private found: string[] = [];
  private word = '';
  private message = '';
  private shownSecond = -1;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    // Seed letters from a word with exactly 7 distinct letters so a pangram always exists.
    const seeds = ALL_WORDS.filter((w) => new Set(w).size === 7);
    // Bounded search: keep the richest hive found (a pangram always exists by construction).
    let best: { letters: string[]; centre: string; answers: string[] } | null = null;
    for (let attempt = 0; attempt < 300 && (!best || best.answers.length < 8); attempt++) {
      const seed = seeds[Math.floor(this.random() * seeds.length)]!;
      const letters = [...new Set(seed)];
      const centre = letters[Math.floor(this.random() * letters.length)]!;
      const answers = hiveAnswers(letters, centre);
      if (!best || answers.length > best.answers.length) best = { letters, centre, answers };
    }
    this.letters = best!.letters;
    this.centre = best!.centre;
    this.answers = best!.answers;
    this.found = [];
    this.word = '';
    this.message = `Make words with 4+ letters that include “${this.centre.toUpperCase()}”.`;
  }

  private get outer() {
    return this.letters.filter((l) => l !== this.centre);
  }

  private get remaining() {
    return Math.max(0, SECONDS - this.elapsed);
  }

  protected override onTick() {
    if (this.remaining <= 0) {
      this.message = `Time! You found ${this.found.length} of ${this.answers.length} words.`;
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
    const w = this.word;
    this.word = '';
    if (w.length < 4) this.message = 'Too short — 4 letters minimum.';
    else if (!w.includes(this.centre)) this.message = `Must include “${this.centre.toUpperCase()}”.`;
    else if (this.found.includes(w)) this.message = 'Already found.';
    else if (!this.answers.includes(w)) {
      this.message = 'Not in our word list.';
      this.sfx.bad();
    } else {
      this.found.push(w);
      const pts = hivePoints(w, this.letters);
      this.addScore(pts * 10);
      this.message = isPangram(w, this.letters) ? `PANGRAM! +${pts * 10}` : `+${pts * 10}`;
      this.sfx.good();
      if (this.found.length === this.answers.length) {
        this.addScore(Math.ceil(this.remaining) * 2);
        this.end('won', { found: this.found.length });
        return;
      }
    }
    this.render();
  }

  protected override onAction(action: string, value: string) {
    if (action === 'letter' && this.word.length < 15) this.word += value;
    else if (action === 'back') this.word = this.word.slice(0, -1);
    else if (action === 'shuffle') this.letters = [this.centre, ...shuffle(this.random, this.outer)];
    else if (action === 'submit') return this.submit();
    this.render();
  }

  protected override onKey(e: KeyboardEvent) {
    const k = keyFromEvent(e);
    if (!k) return false;
    if (k === 'enter') this.submit();
    else if (k === 'back') this.onAction('back', '');
    else if (this.letters.includes(k)) this.onAction('letter', k);
    return true;
  }

  protected view() {
    const hex = (ch: string, centre = false) =>
      `<button type="button" data-action="letter" data-value="${ch}" aria-label="${ch.toUpperCase()}${centre ? ' (centre)' : ''}" style="all:unset;cursor:pointer;width:72px;height:64px;display:flex;align-items:center;justify-content:center;clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%);background:${centre ? '#eab308' : '#1e2a66'};color:${centre ? '#111' : '#e6e9f5'};font-size:26px;font-weight:800">${ch.toUpperCase()}</button>`;
    const o = this.outer;
    const hive = `<div style="display:grid;grid-template-columns:repeat(3,72px);grid-template-rows:repeat(3,64px);gap:4px 6px;justify-items:center">
      <span></span>${hex(o[0]!)}<span></span>${hex(o[1]!)}${hex(this.centre, true)}${hex(o[2]!)}${hex(o[3]!)}${hex(o[4]!)}${hex(o[5]!)}</div>`;
    const list = (this.finished ? this.answers : this.found).map((w) => `<span style="${this.found.includes(w) ? (isPangram(w, this.letters) ? 'color:#facc15;font-weight:800' : 'color:#4ade80;font-weight:700') : 'color:#7d84a8'}">${esc(w)}</span>`).join(' ');
    return `
      <div class="pv-hud"><span>Time <b>${Math.ceil(this.remaining)}s</b></span><span>Found <b>${this.found.length}/${this.answers.length}</b></span><span>Score <b>${this.score}</b></span></div>
      <p class="pv-msg" role="status">${esc(this.message)}</p>
      <div class="pv-panel" style="min-width:240px;text-align:center;font-size:26px;font-weight:800;letter-spacing:3px">${esc(this.word.toUpperCase()) || '&nbsp;'}</div>
      ${hive}
      <div class="pv-row"><button type="button" class="pv-btn" data-action="back" data-value="">⌫</button><button type="button" class="pv-btn" data-action="shuffle" data-value="">⤨</button><button type="button" class="pv-btn primary" data-action="submit" data-value="">Enter</button></div>
      <div class="pv-panel" style="width:min(100%,520px);font-size:14px;line-height:1.7">${list || '<span class="pv-muted">Words you find appear here</span>'}</div>`;
  }
}

export default defineGame(
  { key: 'letter-hive', engine: 'DOM', aspectRatio: 0.75, maxScore: 8_000, controls: [{ action: 'Spell', keys: 'Type or tap letters, Enter to submit' }] },
  (host) => new LetterHive(host),
);
