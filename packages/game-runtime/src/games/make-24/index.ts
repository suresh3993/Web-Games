import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { randInt } from '../../kit/util';

const SECONDS = 180;
type Op = '+' | '−' | '×' | '÷';
const OPS: Op[] = ['+', '−', '×', '÷'];
const apply = (a: number, b: number, op: Op) => (op === '+' ? a + b : op === '−' ? a - b : op === '×' ? a * b : b === 0 ? NaN : a / b);
const near = (x: number, y: number) => Math.abs(x - y) < 1e-9;

/** Exhaustive solver: can these numbers reach 24 using + − × ÷? */
export function solvable(nums: number[]): boolean {
  if (nums.length === 1) return near(nums[0]!, 24);
  for (let i = 0; i < nums.length; i++)
    for (let j = 0; j < nums.length; j++) {
      if (i === j) continue;
      const rest = nums.filter((_, k) => k !== i && k !== j);
      for (const op of OPS) {
        const v = apply(nums[i]!, nums[j]!, op);
        if (Number.isFinite(v) && solvable([...rest, v])) return true;
      }
    }
  return false;
}

const fmt = (x: number) => (Number.isInteger(x) ? String(x) : Math.abs(x * 6 - Math.round(x * 6)) < 1e-9 ? `${Math.round(x * 6)}/6` : x.toFixed(2));

class Make24 extends DomGame {
  private startNums: number[] = [];
  private nums: { v: number; id: number }[] = [];
  private pickA = -1;
  private op: Op | null = null;
  private solved = 0;
  private history: { v: number; id: number }[][] = [];
  private message = '';
  private nextId = 0;
  private shownSecond = -1;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.solved = 0;
    this.newPuzzle();
  }

  private newPuzzle() {
    do this.startNums = Array.from({ length: 4 }, () => randInt(this.random, 1, 9));
    while (!solvable(this.startNums));
    this.resetPuzzle();
    this.message = 'Combine two numbers with an operation. Use all four to make 24.';
  }

  private resetPuzzle() {
    this.nums = this.startNums.map((v) => ({ v, id: this.nextId++ }));
    this.pickA = -1;
    this.op = null;
    this.history = [];
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
    if (action === 'num') {
      const id = Number(value);
      if (this.pickA < 0 || !this.op || id === this.pickA) {
        this.pickA = id === this.pickA ? -1 : id;
      } else {
        const a = this.nums.find((n) => n.id === this.pickA)!;
        const b = this.nums.find((n) => n.id === id)!;
        const v = apply(a.v, b.v, this.op);
        if (!Number.isFinite(v)) {
          this.message = "Can't divide by zero.";
        } else {
          this.history.push(this.nums);
          this.nums = [...this.nums.filter((n) => n !== a && n !== b), { v, id: this.nextId++ }];
          this.sfx.click();
          if (this.nums.length === 1) {
            if (near(v, 24)) {
              this.solved++;
              this.addScore(250 + Math.min(150, Math.ceil(this.remaining)));
              this.sfx.win();
              this.newPuzzle();
              this.message = 'Solved! Next puzzle…';
            } else {
              this.message = `That makes ${fmt(v)}, not 24. Undo or reset.`;
              this.sfx.bad();
            }
          }
        }
        this.pickA = -1;
        this.op = null;
      }
    } else if (action === 'op') this.op = value as Op;
    else if (action === 'undo' && this.history.length) {
      this.nums = this.history.pop()!;
      this.pickA = -1;
      this.op = null;
    } else if (action === 'reset') this.resetPuzzle();
    else if (action === 'skip') this.newPuzzle();
    this.render();
  }

  protected view() {
    const nums = this.nums.map((n) => `<button type="button" class="pv-cell${n.id === this.pickA ? ' sel' : ''}" style="width:84px;font-size:28px" data-action="num" data-value="${n.id}">${fmt(n.v)}</button>`).join('');
    const ops = OPS.map((o) => `<button type="button" class="pv-btn${o === this.op ? ' primary' : ''}" style="font-size:22px;min-width:52px" data-action="op" data-value="${o}" ${this.pickA < 0 ? 'disabled' : ''}>${o}</button>`).join('');
    return `
      <div class="pv-hud"><span>Time <b>${Math.ceil(this.remaining)}s</b></span><span>Solved <b>${this.solved}</b></span><span>Score <b>${this.score}</b></span></div>
      <p class="pv-msg" role="status">${this.message}</p>
      <div class="pv-row">${nums}</div>
      <div class="pv-row">${ops}</div>
      <div class="pv-row"><button type="button" class="pv-btn small" data-action="undo" data-value="" ${this.history.length ? '' : 'disabled'}>↶ Undo</button>
        <button type="button" class="pv-btn small" data-action="reset" data-value="">⟲ Reset</button>
        <button type="button" class="pv-btn small" data-action="skip" data-value="">Skip</button></div>
      <p class="pv-muted">Tap a number, an operation, then another number. Fractions are allowed along the way.</p>`;
  }
}

export default defineGame(
  { key: 'make-24', engine: 'DOM', aspectRatio: 1, maxScore: 40 * 400, controls: [{ action: 'Combine', keys: 'Number → operation → number' }] },
  (host) => new Make24(host),
);
