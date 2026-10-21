import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';

const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#f8fafc'];
const NAMES = ['red', 'amber', 'green', 'blue', 'purple', 'white'];
const PEGS = 4;
const TRIES = 10;

/** Exact = right colour, right place; partial = right colour, wrong place. */
export function feedback(secret: number[], guess: number[]): { exact: number; partial: number } {
  let exact = 0;
  const s: number[] = [];
  const g: number[] = [];
  secret.forEach((v, i) => {
    if (guess[i] === v) exact++;
    else {
      s.push(v);
      g.push(guess[i]!);
    }
  });
  let partial = 0;
  for (const v of g) {
    const k = s.indexOf(v);
    if (k >= 0) {
      partial++;
      s.splice(k, 1);
    }
  }
  return { exact, partial };
}

class CodeBreaker extends DomGame {
  private secret: number[] = [];
  private guesses: { guess: number[]; exact: number; partial: number }[] = [];
  private current: number[] = [];

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.secret = Array.from({ length: PEGS }, () => Math.floor(this.random() * COLORS.length));
    this.guesses = [];
    this.current = [];
  }

  private submit() {
    if (this.current.length !== PEGS) return;
    const fb = feedback(this.secret, this.current);
    this.guesses.push({ guess: this.current, ...fb });
    this.current = [];
    this.sfx.beep(300 + fb.exact * 120, 0.08, 'triangle');
    if (fb.exact === PEGS) {
      this.setScore((TRIES + 1 - this.guesses.length) * 100 + Math.max(0, 300 - Math.floor(this.elapsed)));
      this.sfx.win();
      this.end('won', { guesses: this.guesses.length });
      return;
    }
    if (this.guesses.length >= TRIES) {
      this.end('lost', { guesses: TRIES });
      return;
    }
    this.render();
  }

  protected override onAction(action: string, value: string) {
    if (action === 'color' && this.current.length < PEGS) this.current.push(Number(value));
    else if (action === 'back') this.current.pop();
    else if (action === 'submit') return this.submit();
    this.render();
  }

  protected override onKey(e: KeyboardEvent) {
    if (/^[1-6]$/.test(e.key)) this.onAction('color', String(Number(e.key) - 1));
    else if (e.key === 'Backspace') this.onAction('back', '');
    else if (e.key === 'Enter') this.onAction('submit', '');
    else return false;
    return true;
  }

  private peg(c: number | undefined, size = 30) {
    return `<span style="width:${size}px;height:${size}px;border-radius:50%;display:inline-block;background:${c === undefined ? '#11183a' : COLORS[c]};border:2px solid rgba(148,163,255,.25)"></span>`;
  }

  protected view() {
    const rows = Array.from({ length: TRIES }, (_, k) => {
      const g = this.guesses[k];
      const pegs = g ? g.guess.map((c) => this.peg(c)).join('') : k === this.guesses.length ? [0, 1, 2, 3].map((i) => this.peg(this.current[i])).join('') : [0, 1, 2, 3].map(() => this.peg(undefined)).join('');
      const keys = g
        ? `<span style="display:grid;grid-template-columns:repeat(2,10px);gap:3px" aria-label="${g.exact} exact, ${g.partial} partial">${[...Array(g.exact).fill('#111827'), ...Array(g.partial).fill('#f8fafc'), ...Array(PEGS - g.exact - g.partial).fill('transparent')].map((c) => `<i style="width:10px;height:10px;border-radius:50%;background:${c};border:1px solid #475569"></i>`).join('')}</span>`
        : '<span style="width:23px"></span>';
      return `<div class="pv-row" style="flex-wrap:nowrap;opacity:${g || k === this.guesses.length ? 1 : 0.4}"><span class="pv-muted" style="width:20px">${k + 1}</span>${pegs}${keys}</div>`;
    }).join('');
    const reveal = this.finished ? `<div class="pv-row"><span class="pv-muted">Code:</span>${this.secret.map((c) => this.peg(c)).join('')}</div>` : '';
    const palette = COLORS.map((_, i) => `<button type="button" class="pv-btn" style="padding:6px" data-action="color" data-value="${i}" aria-label="${NAMES[i]} (${i + 1})">${this.peg(i, 26)}</button>`).join('');
    return `
      <p class="pv-msg">Crack the 4-colour code. Black pin = right colour & place · white pin = right colour, wrong place.</p>
      <div class="pv-panel pv-col" style="gap:6px">${rows}</div>
      ${reveal}
      <div class="pv-row">${palette}</div>
      <div class="pv-row"><button type="button" class="pv-btn" data-action="back" data-value="">⌫</button>
        <button type="button" class="pv-btn primary" data-action="submit" data-value="" ${this.current.length === PEGS ? '' : 'disabled'}>Check</button></div>`;
  }
}

export default defineGame(
  { key: 'code-breaker', engine: 'DOM', aspectRatio: 0.7, maxScore: 1_300, controls: [{ action: 'Pick colours', keys: 'Click / 1–6' }, { action: 'Check', keys: 'Enter' }] },
  (host) => new CodeBreaker(host),
);
