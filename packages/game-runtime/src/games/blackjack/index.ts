import type { GameHost } from '../../interfaces/game-module';
import { cardHtml, shuffledDeck, type Card } from '../../kit/cards';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';

const START_CHIPS = 1000;
const HANDS = 12;
const BETS = [10, 25, 50, 100];

/** Best total ≤ 21 counting aces as 1 or 11; `soft` when an ace counts as 11. */
export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += c.rank === 1 ? 11 : Math.min(10, c.rank);
    if (c.rank === 1) aces++;
  }
  while (total > 21 && aces) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export const isBlackjack = (cards: Card[]) => cards.length === 2 && handValue(cards).total === 21;

interface Hand {
  cards: Card[];
  bet: number;
  done: boolean;
  doubled: boolean;
}

class Blackjack extends DomGame {
  private shoe: Card[] = [];
  private chips = START_CHIPS;
  private bet = 25;
  private hands: Hand[] = [];
  private active = 0;
  private dealer: Card[] = [];
  private phase: 'betting' | 'playing' | 'dealer' | 'settled' = 'betting';
  private handsPlayed = 0;
  private message = '';

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.shoe = shuffledDeck(this.random, 4);
    this.chips = START_CHIPS;
    this.bet = 25;
    this.hands = [];
    this.dealer = [];
    this.phase = 'betting';
    this.handsPlayed = 0;
    this.message = `Practice chips only — no real money. ${HANDS} hands per session.`;
    this.setScore(START_CHIPS);
  }

  private draw(): Card {
    if (this.shoe.length < 20) this.shoe = shuffledDeck(this.random, 4);
    return this.shoe.pop()!;
  }

  private deal() {
    if (this.bet > this.chips) return;
    this.chips -= this.bet;
    this.hands = [{ cards: [this.draw(), this.draw()], bet: this.bet, done: false, doubled: false }];
    this.dealer = [this.draw(), this.draw()];
    this.active = 0;
    this.phase = 'playing';
    this.message = '';
    this.sfx.click();
    if (isBlackjack(this.hands[0]!.cards) || isBlackjack(this.dealer)) this.finishDealer(true);
  }

  private nextHand() {
    const hand = this.hands[this.active]!;
    if (handValue(hand.cards).total >= 21) hand.done = true;
    if (!hand.done) return;
    const next = this.hands.findIndex((h) => !h.done);
    if (next >= 0) this.active = next;
    else this.finishDealer(false);
  }

  private finishDealer(natural: boolean) {
    this.phase = 'dealer';
    const anyLive = this.hands.some((h) => handValue(h.cards).total <= 21);
    if (!natural && anyLive) while (handValue(this.dealer).total < 17) this.dealer.push(this.draw());
    const d = handValue(this.dealer).total;
    const dealerBJ = isBlackjack(this.dealer);
    const lines: string[] = [];
    for (const h of this.hands) {
      const p = handValue(h.cards).total;
      const playerBJ = isBlackjack(h.cards) && this.hands.length === 1;
      let payout = 0;
      if (playerBJ && !dealerBJ) payout = h.bet * 2.5;
      else if (p > 21) payout = 0;
      else if (dealerBJ) payout = playerBJ ? h.bet : 0;
      else if (d > 21 || p > d) payout = h.bet * 2;
      else if (p === d) payout = h.bet;
      this.chips += Math.floor(payout);
      lines.push(payout > h.bet ? `+${Math.floor(payout - h.bet)}` : payout === h.bet ? 'push' : `−${h.bet}`);
    }
    this.handsPlayed++;
    this.phase = 'settled';
    this.message = `Dealer ${dealerBJ ? 'blackjack' : d > 21 ? 'busts' : d}. ${lines.join(' · ')}`;
    this.setScore(this.chips);
    this.sfx[lines.some((l) => l.startsWith('+')) ? 'good' : 'bad']();
    if (this.handsPlayed >= HANDS || this.chips < BETS[0]!) {
      this.message += this.chips < BETS[0]! ? ' — out of chips.' : ' — session complete!';
      this.end(this.chips > START_CHIPS ? 'won' : 'completed', { chips: this.chips });
    }
  }

  protected override onAction(action: string, value: string) {
    const hand = this.hands[this.active];
    if (action === 'bet' && (this.phase === 'betting' || this.phase === 'settled')) this.bet = Number(value);
    else if (action === 'deal' && (this.phase === 'betting' || this.phase === 'settled')) this.deal();
    else if (this.phase === 'playing' && hand) {
      if (action === 'hit') {
        hand.cards.push(this.draw());
        this.sfx.click();
        this.nextHand();
      } else if (action === 'stand') {
        hand.done = true;
        this.nextHand();
      } else if (action === 'double' && hand.cards.length === 2 && this.chips >= hand.bet) {
        this.chips -= hand.bet;
        hand.bet *= 2;
        hand.doubled = true;
        hand.cards.push(this.draw());
        hand.done = true;
        this.nextHand();
      } else if (action === 'split' && this.canSplit()) {
        this.chips -= hand.bet;
        const second = hand.cards.pop()!;
        hand.cards.push(this.draw());
        this.hands.push({ cards: [second, this.draw()], bet: hand.bet, done: false, doubled: false });
        this.nextHand();
      }
    }
    if (!this.finished) this.render();
  }

  private canSplit() {
    const h = this.hands[this.active];
    return !!h && this.hands.length === 1 && h.cards.length === 2 && Math.min(10, h.cards[0]!.rank) === Math.min(10, h.cards[1]!.rank) && this.chips >= h.bet;
  }

  protected view() {
    const hideHole = this.phase === 'playing';
    const dealerCards = this.dealer.map((c, i) => cardHtml(c, { faceDown: hideHole && i === 1 })).join('');
    const dealerTotal = this.dealer.length ? (hideHole ? '?' : handValue(this.dealer).total) : '';
    const hands = this.hands
      .map((h, i) => `<div class="pv-col"><div class="pv-row" style="${i === this.active && this.phase === 'playing' ? 'outline:2px solid #22d3ee;border-radius:10px;padding:4px' : ''}">${h.cards.map((c) => cardHtml(c)).join('')}</div><span class="pv-muted">${handValue(h.cards).total} · bet ${h.bet}${h.doubled ? ' (doubled)' : ''}</span></div>`)
      .join('');
    const betting = this.phase === 'betting' || this.phase === 'settled';
    const h = this.hands[this.active];
    const controls = betting
      ? `<div class="pv-row">${BETS.map((b) => `<button type="button" class="pv-btn small${b === this.bet ? ' primary' : ''}" data-action="bet" data-value="${b}" ${b > this.chips ? 'disabled' : ''}>Bet ${b}</button>`).join('')}</div>
         <button type="button" class="pv-btn primary" data-action="deal" data-value="" ${this.bet > this.chips ? 'disabled' : ''}>Deal</button>`
      : `<div class="pv-row">
          <button type="button" class="pv-btn primary" data-action="hit" data-value="">Hit</button>
          <button type="button" class="pv-btn" data-action="stand" data-value="">Stand</button>
          <button type="button" class="pv-btn" data-action="double" data-value="" ${h && h.cards.length === 2 && this.chips >= h.bet ? '' : 'disabled'}>Double</button>
          <button type="button" class="pv-btn" data-action="split" data-value="" ${this.canSplit() ? '' : 'disabled'}>Split</button></div>`;
    return `
      <div class="pv-hud"><span>Chips <b>${this.chips}</b></span><span>Hand <b>${Math.min(this.handsPlayed + (betting ? 1 : 1), HANDS)}/${HANDS}</b></span></div>
      <div class="pv-panel pv-col" style="--cw:clamp(44px,12vw,64px);min-width:min(100%,520px)">
        <span class="pv-muted">Dealer ${dealerTotal}</span><div class="pv-row">${dealerCards || '<span class="pv-muted">—</span>'}</div>
        <div class="pv-row" style="gap:20px;margin-top:12px">${hands || '<span class="pv-muted">Place your bet</span>'}</div>
      </div>
      <p class="pv-msg" role="status">${this.message}</p>
      ${controls}`;
  }
}

export default defineGame(
  { key: 'blackjack', engine: 'DOM', aspectRatio: 1, maxScore: 50_000, scoreLabel: 'Chips', controls: [{ action: 'Play', keys: 'Bet, Deal, then Hit / Stand / Double / Split' }] },
  (host) => new Blackjack(host),
);
