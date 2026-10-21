import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';

class NumberMemory extends DomGame {
  private digits = 3;
  private number = '';
  private answer = '';
  private phase: 'show' | 'input' = 'show';
  private message = '';

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.digits = 3;
    this.next();
  }

  private next() {
    this.number = Array.from({ length: this.digits }, (_, i) => String(i === 0 ? 1 + Math.floor(this.random() * 9) : Math.floor(this.random() * 10))).join('');
    this.answer = '';
    this.phase = 'show';
    this.message = `Memorise ${this.digits} digits`;
    this.schedule(1000 + this.digits * 450, () => {
      this.phase = 'input';
      this.message = 'Type the number you saw';
      this.render();
    });
  }

  private submit() {
    if (this.phase !== 'input') return;
    if (this.answer === this.number) {
      this.addScore(this.digits * 10);
      this.sfx.good();
      this.digits++;
      this.next();
    } else {
      this.message = `It was ${this.number}. You reached ${this.digits - 1} digits.`;
      this.sfx.bad();
      this.end('completed', { digits: this.digits - 1 });
      return;
    }
    this.render();
  }

  private type(k: string) {
    if (this.phase !== 'input') return;
    if (k === 'enter') return this.submit();
    if (k === 'back') this.answer = this.answer.slice(0, -1);
    else if (/^\d$/.test(k) && this.answer.length < 30) this.answer += k;
    this.render();
  }

  protected override onAction(action: string, value: string) {
    if (action === 'pad') this.type(value);
  }

  protected override onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') this.type('enter');
    else if (e.key === 'Backspace') this.type('back');
    else if (/^\d$/.test(e.key)) this.type(e.key);
    else return false;
    return true;
  }

  protected view() {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'enter']
      .map((k) => `<button type="button" class="pv-btn" style="min-height:48px;font-size:20px" data-action="pad" data-value="${k}" ${this.phase === 'input' ? '' : 'disabled'}>${k === 'back' ? '⌫' : k === 'enter' ? '⏎' : k}</button>`)
      .join('');
    return `
      <div class="pv-hud"><span>Digits <b>${this.digits}</b></span><span>Score <b>${this.score}</b></span></div>
      <p class="pv-msg" role="status">${this.message}</p>
      <div class="pv-big" style="letter-spacing:6px;min-height:1.5em;word-break:break-all;max-width:90%">${this.phase === 'show' ? this.number : this.answer || '&nbsp;'}</div>
      <div class="pv-grid" style="--cols:3;--gap:8px;--w:300px">${keys}</div>`;
  }
}

export default defineGame(
  { key: 'number-memory', engine: 'DOM', aspectRatio: 0.8, maxScore: 30 * 31 * 5, controls: [{ action: 'Answer', keys: 'Digits + Enter' }] },
  (host) => new NumberMemory(host),
);
