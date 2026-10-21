import type { GameHost } from '../../interfaces/game-module';
import { cardHtml, SUIT_NAMES, SUIT_SYMBOLS, shuffledDeck, type Card } from '../../kit/cards';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { shuffle } from '../../kit/util';

const PLAYERS = ['You', 'Comet', 'Nova'];

export const canPlay = (c: Card, top: Card, suit: number) => c.rank === 8 || c.suit === suit || c.rank === top.rank;
export const cardPoints = (c: Card) => (c.rank === 8 ? 50 : c.rank >= 10 ? 10 : c.rank === 1 ? 1 : c.rank);

class CrazyEights extends DomGame {
  private hands: Card[][] = [];
  private stock: Card[] = [];
  private discard: Card[] = [];
  private suit = 0;
  private turn = 0;
  private drewThisTurn = false;
  private choosingSuit: Card | null = null;
  private message = '';

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    const deck = shuffledDeck(this.random);
    this.hands = PLAYERS.map((_, p) => deck.slice(p * 5, p * 5 + 5));
    this.stock = deck.slice(15);
    // The first discard may not be an eight.
    let first = this.stock.pop()!;
    while (first.rank === 8) {
      this.stock.unshift(first);
      first = this.stock.pop()!;
    }
    this.discard = [first];
    this.suit = first.suit;
    this.turn = 0;
    this.drewThisTurn = false;
    this.choosingSuit = null;
    this.message = 'Match the suit or rank. Eights are wild.';
  }

  private get top() {
    return this.discard.at(-1)!;
  }

  private drawCard(p: number): Card | null {
    if (!this.stock.length) {
      if (this.discard.length <= 1) return null;
      const keep = this.discard.pop()!;
      this.stock = shuffle(this.random, this.discard);
      this.discard = [keep];
    }
    const c = this.stock.pop()!;
    this.hands[p]!.push(c);
    return c;
  }

  private playCard(p: number, card: Card, suit: number) {
    this.hands[p] = this.hands[p]!.filter((c) => c !== card);
    this.discard.push(card);
    this.suit = suit;
    this.sfx.click();
    if (!this.hands[p]!.length) return this.roundOver(p);
    this.message = `${PLAYERS[p]} played ${card.rank === 8 ? `an 8 — suit is now ${SUIT_NAMES[suit]}` : 'a card'}.`;
    this.nextTurn();
  }

  private passesInARow = 0;

  private nextTurn(passed = false) {
    this.passesInARow = passed ? this.passesInARow + 1 : 0;
    // Blocked game (no cards left to draw and nobody can play): lowest hand wins.
    if (this.passesInARow >= PLAYERS.length) {
      const totals = this.hands.map((h) => h.reduce((a, c) => a + cardPoints(c), 0));
      return this.roundOver(totals.indexOf(Math.min(...totals)));
    }
    this.turn = (this.turn + 1) % PLAYERS.length;
    this.drewThisTurn = false;
    if (this.turn !== 0) {
      this.render();
      this.schedule(650, () => this.aiTurn(this.turn));
    } else this.render();
  }

  private aiTurn(p: number) {
    const hand = this.hands[p]!;
    let options = hand.filter((c) => canPlay(c, this.top, this.suit));
    if (!options.length) {
      const drawn = this.drawCard(p);
      options = drawn && canPlay(drawn, this.top, this.suit) ? [drawn] : [];
      if (!options.length) {
        this.message = `${PLAYERS[p]} drew and passed.`;
        return this.nextTurn(true);
      }
    }
    // Keep eights for emergencies; play the card whose suit is most common in hand.
    const counts = [0, 1, 2, 3].map((s) => hand.filter((c) => c.suit === s && c.rank !== 8).length);
    const nonEight = options.filter((c) => c.rank !== 8).sort((a, b) => counts[b.suit]! - counts[a.suit]!);
    const card = nonEight[0] ?? options[0]!;
    const suit = card.rank === 8 ? counts.indexOf(Math.max(...counts)) : card.suit;
    this.playCard(p, card, suit);
  }

  private roundOver(winner: number) {
    const pts = this.hands.reduce((n, h, p) => (p === winner ? n : n + h.reduce((a, c) => a + cardPoints(c), 0)), 0);
    if (winner === 0) {
      this.setScore(100 + pts);
      this.message = `You went out first and collect ${pts} points! 🎉`;
      this.sfx.win();
      this.end('won');
    } else {
      this.message = `${PLAYERS[winner]} went out first.`;
      this.end('lost');
    }
  }

  protected override onAction(action: string, value: string) {
    if (this.turn !== 0) return;
    if (action === 'suit' && this.choosingSuit) {
      const card = this.choosingSuit;
      this.choosingSuit = null;
      return this.playCard(0, card, Number(value));
    }
    if (action === 'card') {
      const card = this.hands[0]![Number(value)];
      if (!card || !canPlay(card, this.top, this.suit)) {
        this.message = 'That card does not match. Draw if you cannot play.';
        this.sfx.bad();
        return this.render();
      }
      if (card.rank === 8) {
        this.choosingSuit = card;
        this.message = 'Choose the new suit.';
        return this.render();
      }
      return this.playCard(0, card, card.suit);
    }
    if (action === 'draw' && !this.drewThisTurn) {
      const c = this.drawCard(0);
      this.drewThisTurn = true;
      this.message = c ? (canPlay(c, this.top, this.suit) ? 'You drew a playable card — play it or pass.' : 'No luck — pass your turn.') : 'The deck is empty — pass.';
      this.render();
    } else if (action === 'pass' && (this.drewThisTurn || !this.stock.length)) {
      this.message = 'You passed.';
      this.nextTurn(true);
    }
  }

  protected view() {
    const playable = (c: Card) => this.turn === 0 && canPlay(c, this.top, this.suit);
    const hand = this.hands[0]!.map((c, i) => cardHtml(c, { action: 'card', value: i, dim: !playable(c) })).join('');
    const others = [1, 2].map((p) => `<div class="pv-col"><span class="pv-muted">${PLAYERS[p]} · ${this.hands[p]!.length}</span><div class="pv-row" style="gap:0">${this.hands[p]!.map(() => '<div class="pv-card back" style="--cw:22px;margin-left:-8px"></div>').join('')}</div></div>`).join('');
    const suitPicker = this.choosingSuit ? `<div class="pv-row">${[0, 1, 2, 3].map((s) => `<button type="button" class="pv-btn" style="font-size:22px;color:${s === 1 || s === 2 ? '#f87171' : '#e6e9f5'}" data-action="suit" data-value="${s}" aria-label="${SUIT_NAMES[s]}">${SUIT_SYMBOLS[s]}</button>`).join('')}</div>` : '';
    return `
      <div class="pv-row" style="gap:28px">${others}</div>
      <div class="pv-row" style="--cw:clamp(48px,13vw,70px)">
        ${cardHtml(this.stock.length ? this.stock[0]! : null, { faceDown: !!this.stock.length, action: 'draw', label: `Draw (${this.stock.length} left)`, disabled: this.turn !== 0 || this.drewThisTurn })}
        ${cardHtml(this.top)}
        <span class="pv-big" style="color:${this.suit === 1 || this.suit === 2 ? '#f87171' : '#e6e9f5'}" aria-label="Current suit ${SUIT_NAMES[this.suit]}">${SUIT_SYMBOLS[this.suit]}</span>
      </div>
      <p class="pv-msg" role="status">${this.message}${this.turn === 0 ? '' : ` ${PLAYERS[this.turn]} is thinking…`}</p>
      ${suitPicker}
      <div class="pv-row" style="--cw:clamp(40px,10vw,60px);gap:4px">${hand}</div>
      <button type="button" class="pv-btn small" data-action="pass" data-value="" ${this.turn === 0 && (this.drewThisTurn || !this.stock.length) ? '' : 'disabled'}>Pass</button>`;
  }
}

export default defineGame(
  { key: 'crazy-eights', engine: 'DOM', aspectRatio: 0.9, maxScore: 100 + 2 * 30 * 50, controls: [{ action: 'Play', keys: 'Click a matching card, or Draw' }] },
  (host) => new CrazyEights(host),
);
