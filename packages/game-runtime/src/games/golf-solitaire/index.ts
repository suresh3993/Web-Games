import type { GameHost } from '../../interfaces/game-module';
import { cardHtml, shuffledDeck, type Card } from '../../kit/cards';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';

class GolfSolitaire extends DomGame {
  private cols: Card[][] = [];
  private stock: Card[] = [];
  private waste: Card[] = [];

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    const deck = shuffledDeck(this.random);
    this.cols = Array.from({ length: 7 }, (_, i) => deck.slice(i * 5, i * 5 + 5));
    this.waste = [deck[35]!];
    this.stock = deck.slice(36);
  }

  /** Golf: one rank up or down, no wrap-around, nothing may be played on a King. */
  private playable(c: Card) {
    const top = this.waste.at(-1)!;
    return top.rank !== 13 && Math.abs(top.rank - c.rank) === 1;
  }

  private get strokes() {
    return this.cols.reduce((n, c) => n + c.length, 0);
  }

  protected override onAction(action: string, value: string) {
    if (action === 'col') {
      const col = this.cols[Number(value)]!;
      const card = col.at(-1);
      if (!card || !this.playable(card)) {
        this.sfx.bad();
        return;
      }
      this.waste.push(col.pop()!);
      this.sfx.click();
    } else if (action === 'draw' && this.stock.length) this.waste.push(this.stock.pop()!);
    // Points: lower strokes are better in golf, so the score rewards cleared cards.
    this.setScore((35 - this.strokes) * 10 + (this.strokes === 0 ? 200 + this.stock.length * 20 : 0));
    const anyMove = this.cols.some((c) => c.length && this.playable(c.at(-1)!));
    if (this.strokes === 0 || (!this.stock.length && !anyMove)) {
      if (this.strokes === 0) this.sfx.win();
      this.end(this.strokes === 0 ? 'won' : 'completed', { strokes: this.strokes });
      return;
    }
    this.render();
  }

  protected view() {
    const cols = this.cols
      .map((c, i) => `<div class="pv-stack">${c.length ? c.map((card, k) => cardHtml(card, { action: k === c.length - 1 ? 'col' : undefined, value: i, dim: k === c.length - 1 && !this.playable(card) })).join('') : cardHtml(null)}</div>`)
      .join('');
    return `
      <div class="pv-hud"><span>Strokes (cards left) <b>${this.strokes}</b></span><span>Stock <b>${this.stock.length}</b></span><span>Score <b>${this.score}</b></span></div>
      <p class="pv-msg">Move column cards one rank above or below the waste. Nothing goes on a King.</p>
      <div style="--cw:clamp(38px,11vw,62px);display:grid;grid-template-columns:repeat(7,var(--cw));gap:clamp(4px,1.4vw,12px);justify-content:center;align-items:start">${cols}</div>
      <div class="pv-row" style="--cw:clamp(44px,12vw,64px)">
        ${this.stock.length ? cardHtml(this.stock[0]!, { faceDown: true, action: 'draw', label: `Draw (${this.stock.length} left)` }) : cardHtml(null)}
        ${cardHtml(this.waste.at(-1)!)}
      </div>`;
  }
}

export default defineGame(
  { key: 'golf-solitaire', engine: 'DOM', aspectRatio: 1, maxScore: 900, controls: [{ action: 'Play card', keys: 'Click the bottom card of a column' }] },
  (host) => new GolfSolitaire(host),
);
