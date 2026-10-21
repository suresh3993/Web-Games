import type { GameHost } from '../../interfaces/game-module';
import { cardHtml, shuffledDeck, type Card } from '../../kit/cards';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { exposed, triPeakSlots } from '../../kit/peaks';

const SLOTS = triPeakSlots();

/** Ranks one apart, wrapping King ↔ Ace. */
export const adjacentRank = (a: number, b: number) => Math.abs(a - b) === 1 || (a === 1 && b === 13) || (a === 13 && b === 1);

class TriPeaks extends DomGame {
  private cards: Card[] = [];
  private removed: boolean[] = [];
  private stock: Card[] = [];
  private waste: Card[] = [];
  private chain = 0;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    const deck = shuffledDeck(this.random);
    this.cards = deck.slice(0, 28);
    this.waste = [deck[28]!];
    this.stock = deck.slice(29);
    this.removed = Array(28).fill(false);
    this.chain = 0;
  }

  private canPlay(i: number) {
    return exposed(SLOTS, this.removed, i) && adjacentRank(this.cards[i]!.rank, this.waste.at(-1)!.rank);
  }

  protected override onAction(action: string, value: string) {
    if (action === 'card') {
      const i = Number(value);
      if (!this.canPlay(i)) {
        this.sfx.bad();
        return;
      }
      this.removed[i] = true;
      this.waste.push(this.cards[i]!);
      this.chain++;
      this.addScore(10 * this.chain + ([0, 1, 2].includes(i) ? 150 : 0));
      this.sfx.beep(440 + this.chain * 40, 0.05, 'triangle');
    } else if (action === 'draw' && this.stock.length) {
      this.waste.push(this.stock.pop()!);
      this.chain = 0;
    }
    if (this.removed.every(Boolean)) {
      this.addScore(1000 + this.stock.length * 25);
      this.sfx.win();
      this.end('won');
      return;
    }
    if (!this.stock.length && !SLOTS.some((_, i) => this.canPlay(i))) {
      this.end('completed', { cleared: this.removed.filter(Boolean).length });
      return;
    }
    this.render();
  }

  protected view() {
    const cards = SLOTS.map((s, i) => {
      if (this.removed[i]) return '';
      const open = exposed(SLOTS, this.removed, i);
      return `<div style="position:absolute;left:calc(${s.x} * var(--cw) / 2);top:calc(${s.row} * var(--cw) * 0.62)">${cardHtml(this.cards[i]!, { faceDown: !open, action: 'card', value: i, dim: open && !this.canPlay(i) })}</div>`;
    }).join('');
    return `
      <div class="pv-hud"><span>Score <b>${this.score}</b></span><span>Chain <b>${this.chain}</b></span><span>Stock <b>${this.stock.length}</b></span></div>
      <p class="pv-msg">Play cards one rank above or below the waste card (A ↔ K wraps).</p>
      <div style="--cw:clamp(30px,8.4vw,54px);position:relative;width:calc(10 * var(--cw));height:calc(var(--cw) * 1.4 + 3 * var(--cw) * 0.62)">${cards}</div>
      <div class="pv-row" style="--cw:clamp(44px,12vw,64px)">
        ${this.stock.length ? cardHtml(this.stock[0]!, { faceDown: true, action: 'draw', label: `Draw (${this.stock.length} left)` }) : cardHtml(null)}
        ${cardHtml(this.waste.at(-1)!)}
      </div>`;
  }
}

export default defineGame(
  { key: 'tri-peaks', engine: 'DOM', aspectRatio: 1.2, maxScore: 8_000, controls: [{ action: 'Play card', keys: 'Click a card ±1 from the waste' }] },
  (host) => new TriPeaks(host),
);
