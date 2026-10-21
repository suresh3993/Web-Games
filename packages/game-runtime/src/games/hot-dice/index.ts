import type { GameHost } from '../../interfaces/game-module';
import { dieHtml } from '../../kit/dice';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { bestScore, scoreSelection } from './logic';

const TARGET = 5_000;
const NAMES = ['You', 'Computer'];

class HotDice extends DomGame {
  private banked = [0, 0];
  private turn = 0;
  private turnPoints = 0;
  private diceLeft = 6;
  private roll: number[] = [];
  private selected = new Set<number>();
  private message = '';

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.banked = [0, 0];
    this.turn = 0;
    this.startTurn();
    this.message = 'Roll the dice. Set aside scoring dice (1s, 5s, triples…), then roll again or bank.';
  }

  private startTurn() {
    this.turnPoints = 0;
    this.diceLeft = 6;
    this.roll = [];
    this.selected.clear();
  }

  private doRoll() {
    this.roll = Array.from({ length: this.diceLeft }, () => 1 + Math.floor(this.random() * 6));
    this.selected.clear();
    this.sfx.beep(360, 0.05, 'square', 0.04);
    if (bestScore(this.roll).points === 0) {
      this.message = `${NAMES[this.turn]} rolled a farkle — no scoring dice! Turn points lost.`;
      this.sfx.bad();
      this.render();
      this.schedule(1300, () => this.passTurn());
      return false;
    }
    return true;
  }

  private setAside(indices: number[]) {
    const dice = indices.map((i) => this.roll[i]!);
    const pts = scoreSelection(dice);
    if (pts === null) return false;
    this.turnPoints += pts;
    this.diceLeft -= indices.length;
    if (this.diceLeft === 0) {
      this.diceLeft = 6; // hot dice!
      this.message = 'Hot dice! All six scored — roll them all again.';
      this.sfx.good();
    }
    this.roll = [];
    this.selected.clear();
    return true;
  }

  private bank() {
    this.banked[this.turn]! += this.turnPoints;
    if (this.turn === 0) this.setScore(this.banked[0]!);
    this.message = `${NAMES[this.turn]} banked ${this.turnPoints}.`;
    if (this.banked[this.turn]! >= TARGET) {
      const won = this.turn === 0;
      if (won) {
        this.setScore(this.banked[0]! + 1000);
        this.sfx.win();
      }
      this.message = won ? `You reached ${TARGET} first! 🎉` : `The computer reached ${TARGET}.`;
      this.end(won ? 'won' : 'lost', { you: this.banked[0]!, cpu: this.banked[1]! });
      return;
    }
    this.passTurn();
  }

  private passTurn() {
    this.turn = this.turn === 0 ? 1 : 0;
    this.startTurn();
    if (this.turn === 1) this.cpuStep();
    this.render();
  }

  /** CPU: keep the best scoring dice; bank when the risk outweighs the reward. */
  private cpuStep() {
    this.schedule(800, () => {
      if (this.turn !== 1 || this.finished) return;
      if (!this.doRoll()) return;
      this.render();
      this.schedule(900, () => {
        const { keep } = bestScore(this.roll);
        this.setAside(keep);
        const shouldBank = (this.turnPoints >= 350 && this.diceLeft <= 2) || this.turnPoints >= 700 || this.banked[1]! + this.turnPoints >= TARGET;
        this.message = `Computer sets aside ${keep.length} dice (turn: ${this.turnPoints}).`;
        this.render();
        if (shouldBank && this.diceLeft !== 6) this.schedule(700, () => this.bank());
        else this.cpuStep();
      });
    });
  }

  protected override onAction(action: string, value: string) {
    if (this.turn !== 0) return;
    if (action === 'roll') {
      if (this.roll.length) {
        if (!this.selected.size) {
          this.message = 'Set aside at least one scoring die first.';
          return this.render();
        }
        if (!this.setAside([...this.selected])) {
          this.message = 'Every die you set aside must score.';
          return this.render();
        }
      }
      if (!this.doRoll()) return;
    } else if (action === 'die' && this.roll.length) {
      const i = Number(value);
      if (this.selected.has(i)) this.selected.delete(i);
      else this.selected.add(i);
    } else if (action === 'bank') {
      if (this.roll.length) {
        if (!this.selected.size || !this.setAside([...this.selected])) {
          this.message = 'Select valid scoring dice before banking.';
          return this.render();
        }
      }
      if (this.turnPoints === 0) return;
      return this.bank();
    }
    this.render();
  }

  protected view() {
    const sel = [...this.selected].map((i) => this.roll[i]!);
    const selPts = sel.length ? scoreSelection(sel) : 0;
    const dice = this.roll.length
      ? this.roll.map((d, i) => dieHtml(d, { action: 'die', index: i, held: this.selected.has(i), disabled: this.turn !== 0 })).join('')
      : '<span class="pv-muted">Roll to start the turn</span>';
    return `
      <div class="pv-hud"><span>You <b>${this.banked[0]}</b></span><span>Computer <b>${this.banked[1]}</b></span><span>Target <b>${TARGET}</b></span></div>
      <p class="pv-msg" role="status">${this.message}</p>
      <div class="pv-panel" style="text-align:center">${NAMES[this.turn]}'s turn · turn points <b>${this.turnPoints}</b>${sel.length ? ` · selected ${selPts === null ? '✗ invalid' : `+${selPts}`}` : ''} · dice left ${this.diceLeft}</div>
      <div class="pv-row" style="min-height:70px">${dice}</div>
      <div class="pv-row"><button type="button" class="pv-btn primary" data-action="roll" data-value="" ${this.turn ? 'disabled' : ''}>🎲 ${this.roll.length ? 'Keep & roll' : 'Roll'}</button>
        <button type="button" class="pv-btn" data-action="bank" data-value="" ${this.turn || (this.turnPoints === 0 && !sel.length) ? 'disabled' : ''}>Bank points</button></div>
      <p class="pv-muted">1 = 100 · 5 = 50 · three of a kind = face × 100 (1s = 1000), each extra die doubles · straight or three pairs = 1500</p>`;
  }
}

export default defineGame(
  { key: 'hot-dice', engine: 'DOM', aspectRatio: 0.9, maxScore: 50_000, controls: [{ action: 'Select dice / roll / bank', keys: 'Click' }] },
  (host) => new HotDice(host),
);
