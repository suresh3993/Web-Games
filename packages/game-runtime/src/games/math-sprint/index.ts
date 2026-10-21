import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { TimedAnswerGame } from '../../kit/quiz';
import { pick, randInt } from '../../kit/util';

/** Builds a question whose difficulty grows with the number answered correctly. */
export function makeQuestion(random: () => number, level: number): { text: string; answer: number } {
  const op = pick(random, level < 3 ? ['+', '-'] : ['+', '-', '×', '÷']);
  const max = 10 + level * 6;
  if (op === '+') {
    const a = randInt(random, 1, max);
    const b = randInt(random, 1, max);
    return { text: `${a} + ${b}`, answer: a + b };
  }
  if (op === '-') {
    const a = randInt(random, 1, max);
    const b = randInt(random, 1, a);
    return { text: `${a} − ${b}`, answer: a - b };
  }
  const f = Math.min(12, 3 + level);
  const a = randInt(random, 2, f);
  const b = randInt(random, 2, f);
  return op === '×' ? { text: `${a} × ${b}`, answer: a * b } : { text: `${a * b} ÷ ${a}`, answer: b };
}

class MathSprint extends TimedAnswerGame {
  protected readonly duration = 60;
  private q = { text: '', answer: 0 };

  constructor(host: GameHost) {
    super(host);
  }

  protected nextQuestion() {
    this.q = makeQuestion(this.random, Math.floor(this.correct / 4));
  }
  protected prompt() {
    return `${this.q.text} = ?`;
  }
  protected check(answer: string) {
    return Number(answer) === this.q.answer;
  }
  protected expected() {
    return String(this.q.answer);
  }
}

export default defineGame(
  { key: 'math-sprint', engine: 'DOM', aspectRatio: 0.75, maxScore: 6_000, controls: [{ action: 'Answer', keys: 'Digits + Enter / keypad' }] },
  (host) => new MathSprint(host),
);
