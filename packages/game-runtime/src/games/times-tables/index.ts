import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { TimedAnswerGame } from '../../kit/quiz';
import { randInt } from '../../kit/util';

class TimesTables extends TimedAnswerGame {
  protected readonly duration = 60;
  private a = 2;
  private b = 2;
  /** Facts answered wrongly come back more often (spaced repetition lite). */
  private missed: [number, number][] = [];

  constructor(host: GameHost) {
    super(host);
  }

  protected override reset() {
    this.missed = [];
    super.reset();
  }

  protected nextQuestion() {
    if (this.missed.length && this.random() < 0.4) {
      [this.a, this.b] = this.missed.shift()!;
      return;
    }
    const max = Math.min(12, 5 + Math.floor(this.correct / 5));
    this.a = randInt(this.random, 2, max);
    this.b = randInt(this.random, 2, 12);
  }
  protected prompt() {
    return `${this.a} × ${this.b}`;
  }
  protected check(answer: string) {
    const ok = Number(answer) === this.a * this.b;
    if (!ok) this.missed.push([this.a, this.b]);
    return ok;
  }
  protected expected() {
    return String(this.a * this.b);
  }
}

export default defineGame(
  { key: 'times-tables', engine: 'DOM', aspectRatio: 0.75, maxScore: 6_000, controls: [{ action: 'Answer', keys: 'Digits + Enter / keypad' }] },
  (host) => new TimesTables(host),
);
