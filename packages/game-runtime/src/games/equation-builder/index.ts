import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { pick, randInt, shuffle } from '../../kit/util';

const SECONDS = 120;

/** Evaluates a left-to-right token list honouring × and ÷ precedence. */
export function evaluate(tokens: (number | string)[]): number {
  const stack: (number | string)[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t === '×' || t === '÷') {
      const left = stack.pop() as number;
      const right = tokens[++i] as number;
      stack.push(t === '×' ? left * right : left / right);
    } else stack.push(t);
  }
  let total = stack[0] as number;
  for (let i = 1; i < stack.length; i += 2) total = stack[i] === '+' ? total + (stack[i + 1] as number) : total - (stack[i + 1] as number);
  return total;
}

/** Normalises '−' to '-' for evaluation. */
const toTokens = (values: number[], ops: string[]) => {
  const tokens: (number | string)[] = [values[0]!];
  ops.forEach((o, k) => tokens.push(o === '−' ? '-' : o, values[k + 1]!));
  return tokens;
};

interface Puzzle {
  ops: string[];
  result: number;
  tiles: number[];
  blanks: number;
}

export function makeEquation(random: () => number, level: number): Puzzle {
  const operands = level < 3 ? 2 : 3;
  for (;;) {
    const nums = Array.from({ length: operands }, () => randInt(random, 1, 9));
    const ops = Array.from({ length: operands - 1 }, () => pick(random, level < 2 ? ['+', '−'] : ['+', '−', '×']));
    const result = evaluate(toTokens(nums, ops));
    if (result < 0 || !Number.isInteger(result)) continue;
    // Tiles: the correct numbers plus decoys.
    const decoys = Array.from({ length: 2 }, () => randInt(random, 1, 9));
    return { ops, result, tiles: shuffle(random, [...nums, ...decoys]), blanks: operands };
  }
}


class EquationBuilder extends DomGame {
  private puzzle!: Puzzle;
  private slots: (number | null)[] = [];
  private level = 1;
  private solved = 0;
  private message = '';
  private shownSecond = -1;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.level = 1;
    this.solved = 0;
    this.next();
  }

  private next() {
    this.puzzle = makeEquation(this.random, this.level);
    this.slots = Array(this.puzzle.blanks).fill(null);
    this.message = 'Fill the blanks with tiles to make the equation true (× before + and −).';
  }

  private get remaining() {
    return Math.max(0, SECONDS - this.elapsed);
  }

  protected override onTick() {
    if (this.remaining <= 0) {
      this.end('completed', { solved: this.solved });
      return;
    }
    const s = Math.ceil(this.remaining);
    if (s !== this.shownSecond) {
      this.shownSecond = s;
      this.render();
    }
  }

  protected override onAction(action: string, value: string) {
    if (action === 'tile') {
      const k = Number(value);
      const empty = this.slots.indexOf(null);
      if (empty >= 0 && !this.slots.includes(k)) this.slots[empty] = k;
      if (!this.slots.includes(null)) {
        const values = this.slots.map((i) => this.puzzle.tiles[i!]!);
        const lhs = evaluate(toTokens(values, this.puzzle.ops));
        if (Math.abs(lhs - this.puzzle.result) < 1e-9) {
          this.solved++;
          this.addScore(100 * this.level);
          this.sfx.good();
          if (this.solved % 3 === 0) this.level++;
          this.next();
          this.message = 'Correct! Next equation…';
        } else {
          this.message = `That gives ${lhs}. Try again.`;
          this.sfx.bad();
          this.slots = this.slots.map(() => null);
        }
      }
    } else if (action === 'slot') this.slots[Number(value)] = null;
    else if (action === 'skip') this.next();
    this.render();
  }

  protected view() {
    const parts: string[] = [];
    this.slots.forEach((s, k) => {
      parts.push(`<button type="button" class="pv-cell" style="width:60px;font-size:28px;border-style:${s === null ? 'dashed' : 'solid'}" data-action="slot" data-value="${k}" aria-label="Blank ${k + 1}${s !== null ? `: ${this.puzzle.tiles[s]}` : ''}">${s === null ? '' : this.puzzle.tiles[s]}</button>`);
      if (k < this.puzzle.ops.length) parts.push(`<span class="pv-big">${this.puzzle.ops[k]}</span>`);
    });
    parts.push(`<span class="pv-big">= ${this.puzzle.result}</span>`);
    const tiles = this.puzzle.tiles.map((t, k) => `<button type="button" class="pv-btn" style="font-size:24px;min-width:56px;min-height:52px" data-action="tile" data-value="${k}" ${this.slots.includes(k) ? 'disabled' : ''}>${t}</button>`).join('');
    return `
      <div class="pv-hud"><span>Time <b>${Math.ceil(this.remaining)}s</b></span><span>Level <b>${this.level}</b></span><span>Solved <b>${this.solved}</b></span><span>Score <b>${this.score}</b></span></div>
      <p class="pv-msg" role="status">${this.message}</p>
      <div class="pv-row" style="flex-wrap:nowrap">${parts.join('')}</div>
      <div class="pv-row">${tiles}</div>
      <p class="pv-muted">Click a filled blank to take its tile back. <button type="button" class="pv-btn small" data-action="skip" data-value="">Skip</button></p>`;
  }
}

export default defineGame(
  { key: 'equation-builder', engine: 'DOM', aspectRatio: 1, maxScore: 60 * 100 * 20, controls: [{ action: 'Fill blank', keys: 'Click tiles' }] },
  (host) => new EquationBuilder(host),
);
