import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { TimedAnswerGame } from '../../kit/quiz';
import { pick, randInt } from '../../kit/util';

/** Generates a sequence (5 shown terms) and its next term. Difficulty unlocks pattern types. */
export function makePattern(random: () => number, level: number): { terms: number[]; next: number } {
  const kinds = ['arith', 'arith', 'geo', 'squares', 'fib', 'alt', 'growing'].slice(0, Math.min(7, 2 + level));
  const kind = pick(random, kinds);
  const seq: number[] = [];
  switch (kind) {
    case 'arith': {
      const a = randInt(random, -10, 30);
      const d = pick(random, [-7, -5, -3, 2, 3, 4, 5, 6, 7, 9, 11]);
      for (let k = 0; k < 6; k++) seq.push(a + d * k);
      break;
    }
    case 'geo': {
      const a = randInt(random, 1, 5);
      const r = pick(random, [2, 3]);
      for (let k = 0; k < 6; k++) seq.push(a * r ** k);
      break;
    }
    case 'squares': {
      const c = randInt(random, -3, 5);
      const s = randInt(random, 1, 4);
      for (let k = 0; k < 6; k++) seq.push((s + k) ** 2 + c);
      break;
    }
    case 'fib': {
      let [a, b] = [randInt(random, 1, 5), randInt(random, 1, 6)];
      for (let k = 0; k < 6; k++) {
        seq.push(a);
        [a, b] = [b, a + b];
      }
      break;
    }
    case 'alt': {
      const x = randInt(random, 3, 9);
      const y = randInt(random, 1, x - 1);
      let v = randInt(random, 1, 20);
      for (let k = 0; k < 6; k++) {
        seq.push(v);
        v += k % 2 === 0 ? x : -y;
      }
      break;
    }
    default: {
      let v = randInt(random, 1, 10);
      let d = randInt(random, 1, 3);
      for (let k = 0; k < 6; k++) {
        seq.push(v);
        v += d;
        d += 1;
      }
    }
  }
  return { terms: seq.slice(0, 5), next: seq[5]! };
}

class NumberPatterns extends TimedAnswerGame {
  protected readonly duration = 90;
  private q = { terms: [] as number[], next: 0 };

  constructor(host: GameHost) {
    super(host);
  }

  protected nextQuestion() {
    this.q = makePattern(this.random, Math.floor(this.correct / 3));
  }
  protected prompt() {
    return `${this.q.terms.join(', ')}, ?`;
  }
  protected check(answer: string) {
    return Number(answer) === this.q.next;
  }
  protected expected() {
    return String(this.q.next);
  }
  protected override points() {
    return 20 * Math.min(5, 1 + Math.floor(this.streak / 3));
  }
}

export default defineGame(
  { key: 'number-patterns', engine: 'DOM', aspectRatio: 0.75, maxScore: 8_000, controls: [{ action: 'Answer', keys: 'Digits (− for negatives) + Enter' }] },
  (host) => new NumberPatterns(host),
);
