import type { GameHost } from '../../interfaces/game-module';
import { cardHtml, newDeck, type Card } from '../../kit/cards';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { shuffle } from '../../kit/util';

interface SCard extends Card {
  up: boolean;
}
type Suits = 1 | 2 | 4;

/** Is pile[from..] a same-suit descending run? */
export function isRun(pile: SCard[], from: number): boolean {
  for (let k = from; k < pile.length; k++) {
    if (!pile[k]!.up) return false;
    if (k > from && (pile[k]!.suit !== pile[k - 1]!.suit || pile[k]!.rank !== pile[k - 1]!.rank - 1)) return false;
  }
  return from < pile.length;
}

export function spiderDeck(suits: Suits, random: () => number): SCard[] {
  const base = newDeck().filter((c) => (suits === 1 ? c.suit === 0 : suits === 2 ? c.suit <= 1 : true));
  const copies = 104 / base.length;
  return shuffle(random, Array.from({ length: copies }, () => base).flat()).map((c) => ({ ...c, up: false }));
}

class Spider extends DomGame {
  private suits: Suits = 1;
  private cols: SCard[][] = [];
  private stock: SCard[] = [];
  private completed = 0;
  private selected: { col: number; from: number } | null = null;
  private history: { cols: SCard[][]; stock: SCard[]; completed: number; score: number }[] = [];
  private moves = 0;
  private message = '';

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    const deck = spiderDeck(this.suits, this.random);
    this.cols = Array.from({ length: 10 }, (_, i) => deck.splice(0, i < 4 ? 6 : 5));
    for (const c of this.cols) c.at(-1)!.up = true;
    this.stock = deck;
    this.completed = 0;
    this.selected = null;
    this.history = [];
    this.moves = 0;
    this.message = 'Build same-suit runs from King to Ace.';
    this.setScore(500);
  }

  private snapshot() {
    this.history.push({ cols: this.cols.map((c) => c.map((x) => ({ ...x }))), stock: [...this.stock], completed: this.completed, score: this.score });
  }

  private afterMove(col: number) {
    const pile = this.cols[col]!;
    // Remove a completed K..A same-suit run.
    if (pile.length >= 13 && isRun(pile, pile.length - 13) && pile[pile.length - 13]!.rank === 13) {
      pile.splice(pile.length - 13);
      this.completed++;
      this.addScore(100);
      this.sfx.win();
    }
    const top = pile.at(-1);
    if (top && !top.up) top.up = true;
  }

  private moveRun(from: { col: number; from: number }, to: number) {
    const src = this.cols[from.col]!;
    const run = src.slice(from.from);
    const target = this.cols[to]!.at(-1);
    if (from.col === to || !isRun(src, from.from)) return false;
    if (target && target.rank !== run[0]!.rank + 1) return false;
    this.snapshot();
    src.splice(from.from);
    this.cols[to]!.push(...run);
    this.afterMove(from.col);
    this.afterMove(to);
    this.moves++;
    this.setScore(this.score - 1);
    this.sfx.click();
    return true;
  }

  private dealRow() {
    if (!this.stock.length) return;
    if (this.cols.some((c) => !c.length)) {
      this.message = 'Fill every empty column before dealing.';
      this.render();
      return;
    }
    this.snapshot();
    for (const c of this.cols) c.push({ ...this.stock.pop()!, up: true });
    this.cols.forEach((_, i) => this.afterMove(i));
    this.moves++;
    this.sfx.beep(380, 0.08, 'triangle');
  }

  private checkEnd() {
    if (this.completed === 8) {
      this.addScore(Math.max(0, 900 - Math.floor(this.elapsed)));
      this.end('won', { moves: this.moves });
      return true;
    }
    return false;
  }

  protected override onAction(action: string, value: string) {
    if (action === 'suits' && !this.moves) {
      this.suits = Number(value) as Suits;
      this.reset();
    } else if (action === 'deal') this.dealRow();
    else if (action === 'undo' && this.history.length) {
      const h = this.history.pop()!;
      this.cols = h.cols;
      this.stock = h.stock;
      this.completed = h.completed;
      this.setScore(h.score - 1);
      this.selected = null;
    } else if (action === 'card') {
      const [col, k] = value.split(':').map(Number) as [number, number];
      if (this.selected && this.moveRun(this.selected, col)) this.selected = null;
      else this.selected = this.cols[col]![k]?.up && isRun(this.cols[col]!, k) ? { col, from: k } : null;
    }
    if (this.checkEnd()) return;
    this.render();
  }

  protected view() {
    const cols = this.cols
      .map((pile, i) => {
        if (!pile.length) return `<div class="pv-stack">${cardHtml(null, { action: 'card', value: `${i}:0` })}</div>`;
        return `<div class="pv-stack tight">${pile.map((c, k) => cardHtml(c, { faceDown: !c.up, action: 'card', value: `${i}:${k}`, selected: !!this.selected && this.selected.col === i && k >= this.selected.from })).join('')}</div>`;
      })
      .join('');
    const suitBtns = ([1, 2, 4] as Suits[]).map((s) => `<button type="button" class="pv-btn small${s === this.suits ? ' primary' : ''}" data-action="suits" data-value="${s}" ${this.moves ? 'disabled' : ''}>${s} suit${s > 1 ? 's' : ''}</button>`).join('');
    return `
      <div class="pv-row">${suitBtns}
        <button type="button" class="pv-btn small" data-action="undo" data-value="" ${this.history.length ? '' : 'disabled'}>↶ Undo</button>
        <button type="button" class="pv-btn small primary" data-action="deal" data-value="" ${this.stock.length ? '' : 'disabled'}>Deal row (${this.stock.length / 10})</button></div>
      <div class="pv-hud"><span>Score <b>${this.score}</b></span><span>Runs <b>${this.completed}/8</b></span><span>Moves <b>${this.moves}</b></span></div>
      <p class="pv-msg">${this.message}</p>
      <div style="--cw:clamp(30px,8.6vw,58px);display:grid;grid-template-columns:repeat(10,var(--cw));gap:clamp(3px,1vw,8px);justify-content:center;align-items:start">${cols}</div>`;
  }
}

export default defineGame(
  { key: 'spider-solitaire', engine: 'DOM', aspectRatio: 1.1, maxScore: 2_300, controls: [{ action: 'Move run', keys: 'Click a run, then a column' }] },
  (host) => new Spider(host),
);
