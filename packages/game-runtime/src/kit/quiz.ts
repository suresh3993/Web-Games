import { DomGame } from './dom-game';

/**
 * Base for timed "answer as many as you can" games with a numeric keypad
 * (Math Sprint, Times Tables, Number Memory…). Subclasses provide questions.
 */
export abstract class TimedAnswerGame extends DomGame {
  protected abstract readonly duration: number;
  protected answer = '';
  protected correct = 0;
  protected wrong = 0;
  protected streak = 0;
  protected feedback = '';
  protected feedbackTone: 'good' | 'bad' | '' = '';
  #shownSecond = -1;

  protected abstract nextQuestion(): void;
  protected abstract prompt(): string;
  /** Returns true when the typed answer is correct. */
  protected abstract check(answer: string): boolean;
  protected abstract expected(): string;
  protected points(): number {
    return 10 * Math.min(5, 1 + Math.floor(this.streak / 3));
  }
  /** Extra HTML above the keypad. */
  protected extra(): string {
    return '';
  }

  protected get remaining() {
    return Math.max(0, this.duration - this.elapsed);
  }

  protected reset() {
    this.answer = '';
    this.correct = 0;
    this.wrong = 0;
    this.streak = 0;
    this.feedback = '';
    this.feedbackTone = '';
    this.nextQuestion();
  }

  protected override onTick() {
    if (this.remaining <= 0) {
      this.end('completed', { correct: this.correct, wrong: this.wrong });
      return;
    }
    const s = Math.ceil(this.remaining);
    if (s !== this.#shownSecond) {
      this.#shownSecond = s;
      this.render();
    }
  }

  protected submit() {
    if (!this.answer) return;
    if (this.check(this.answer)) {
      this.correct++;
      this.streak++;
      this.addScore(this.points());
      this.feedback = `✓ +${this.points()}`;
      this.feedbackTone = 'good';
      this.sfx.good();
    } else {
      this.wrong++;
      this.streak = 0;
      this.feedback = `✗ It was ${this.expected()}`;
      this.feedbackTone = 'bad';
      this.sfx.bad();
    }
    this.answer = '';
    this.nextQuestion();
    this.render();
  }

  protected type(key: string) {
    if (key === 'enter') return this.submit();
    if (key === 'back') this.answer = this.answer.slice(0, -1);
    else if (key === '-' && !this.answer) this.answer = '-';
    else if (/^\d$/.test(key) && this.answer.length < 8) this.answer += key;
    this.render();
  }

  protected override onAction(action: string, value: string) {
    if (action === 'pad') this.type(value);
  }

  protected override onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') this.type('enter');
    else if (e.key === 'Backspace') this.type('back');
    else if (e.key === '-' || /^\d$/.test(e.key)) this.type(e.key);
    else return false;
    return true;
  }

  protected view() {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '-', '0', 'back']
      .map((k) => `<button type="button" class="pv-btn" style="min-height:48px;font-size:20px" data-action="pad" data-value="${k}" aria-label="${k === 'back' ? 'Backspace' : k}">${k === 'back' ? '⌫' : k}</button>`)
      .join('');
    return `
      <div class="pv-hud"><span>Time <b>${Math.ceil(this.remaining)}s</b></span><span>Score <b>${this.score}</b></span><span>Streak <b>${this.streak}</b></span></div>
      <div class="pv-meter" aria-hidden="true"><i style="width:${(this.remaining / this.duration) * 100}%"></i></div>
      ${this.extra()}
      <div class="pv-big" aria-live="polite">${this.prompt()}</div>
      <div class="pv-panel" style="min-width:200px;text-align:center;font-size:30px;font-weight:800;min-height:56px" aria-label="Your answer">${this.answer || '&nbsp;'}</div>
      <p class="pv-msg ${this.feedbackTone}" role="status">${this.feedback}</p>
      <div class="pv-grid" style="--cols:3;--gap:8px;--w:300px">${keys}</div>
      <button type="button" class="pv-btn primary" style="min-width:300px;min-height:48px" data-action="pad" data-value="enter">Submit ⏎</button>`;
  }
}
