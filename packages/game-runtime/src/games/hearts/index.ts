import type { GameHost } from '../../interfaces/game-module';
import { cardHtml, cardName, sameCard, shuffledDeck, type Card } from '../../kit/cards';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { aiPass, aiPlay, legalPlays, penalty, settleRound, trickWinner } from './logic';

const NAMES = ['You', 'West', 'North', 'East'];
const PASS_DIRS = ['left', 'right', 'across', 'none'] as const;
const TARGET = 50;

const sortHand = (h: Card[]) => h.sort((a, b) => (a.suit === b.suit ? (a.rank === 1 ? 14 : a.rank) - (b.rank === 1 ? 14 : b.rank) : [3, 2, 0, 1].indexOf(a.suit) - [3, 2, 0, 1].indexOf(b.suit)));

class Hearts extends DomGame {
  private hands: Card[][] = [];
  private totals = [0, 0, 0, 0];
  private roundPoints = [0, 0, 0, 0];
  private round = 0;
  private phase: 'pass' | 'play' | 'between' = 'pass';
  private passing: Card[] = [];
  private trick: { player: number; card: Card }[] = [];
  private turn = 0;
  private heartsBroken = false;
  private tricksPlayed = 0;
  private message = '';

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.totals = [0, 0, 0, 0];
    this.round = 0;
    this.startRound();
  }

  private get passDir() {
    return PASS_DIRS[this.round % 4]!;
  }

  private startRound() {
    const deck = shuffledDeck(this.random);
    this.hands = [0, 1, 2, 3].map((p) => sortHand(deck.slice(p * 13, p * 13 + 13)));
    this.roundPoints = [0, 0, 0, 0];
    this.trick = [];
    this.heartsBroken = false;
    this.tricksPlayed = 0;
    this.passing = [];
    if (this.passDir === 'none') {
      this.beginPlay();
    } else {
      this.phase = 'pass';
      this.message = `Round ${this.round + 1}: choose 3 cards to pass ${this.passDir}.`;
    }
  }

  private doPass() {
    const offset = { left: 1, right: 3, across: 2, none: 0 }[this.passDir];
    const outgoing = [0, 1, 2, 3].map((p) => (p === 0 ? this.passing : aiPass(this.hands[p]!)));
    outgoing.forEach((cards, p) => (this.hands[p] = this.hands[p]!.filter((c) => !cards.some((x) => sameCard(x, c)))));
    outgoing.forEach((cards, p) => this.hands[(p + offset) % 4]!.push(...cards));
    this.hands.forEach(sortHand);
    this.beginPlay();
  }

  private beginPlay() {
    this.phase = 'play';
    this.turn = this.hands.findIndex((h) => h.some((c) => c.suit === 3 && c.rank === 2));
    this.message = this.turn === 0 ? 'You lead the 2♣.' : `${NAMES[this.turn]} leads.`;
    this.continuePlay();
  }

  private context(p: number) {
    return { hand: this.hands[p]!, trick: this.trick.map((t) => t.card), heartsBroken: this.heartsBroken, firstTrick: this.tricksPlayed === 0 };
  }

  private continuePlay() {
    if (this.turn !== 0 && this.trick.length < 4) {
      this.schedule(450, () => {
        this.play(this.turn, aiPlay(this.context(this.turn)));
      });
    }
  }

  private play(p: number, card: Card) {
    this.hands[p] = this.hands[p]!.filter((c) => !sameCard(c, card));
    this.trick.push({ player: p, card });
    if (card.suit === 1) this.heartsBroken = true;
    this.sfx.click();
    if (this.trick.length === 4) {
      const w = this.trick[trickWinner(this.trick.map((t) => t.card))]!.player;
      const pts = this.trick.reduce((n, t) => n + penalty(t.card), 0);
      this.roundPoints[w]! += pts;
      this.message = `${NAMES[w]} take${w === 0 ? '' : 's'} the trick${pts ? ` (+${pts})` : ''}.`;
      this.tricksPlayed++;
      this.render();
      this.schedule(1000, () => {
        this.trick = [];
        this.turn = w;
        if (this.tricksPlayed === 13) this.endRound();
        else {
          this.render();
          this.continuePlay();
        }
      });
      return;
    }
    this.turn = (p + 1) % 4;
    this.render();
    this.continuePlay();
  }

  private endRound() {
    const settled = settleRound(this.roundPoints);
    settled.forEach((pts, i) => (this.totals[i]! += pts));
    this.round++;
    const moon = this.roundPoints.findIndex((p) => p === 26);
    this.message = moon >= 0 ? `${NAMES[moon]} shot the moon!` : `Round over: ${settled.map((p, i) => `${NAMES[i]} +${p}`).join(', ')}`;
    if (Math.max(...this.totals) >= TARGET) {
      const best = Math.min(...this.totals);
      const won = this.totals[0] === best;
      this.setScore(Math.max(0, TARGET * 2 - this.totals[0]!) * 4 + (won ? 300 : 0));
      if (won) this.sfx.win();
      this.message += won ? ' — you have the lowest score and win! 🎉' : ` — ${NAMES[this.totals.indexOf(best)]} wins with the lowest score.`;
      this.end(won ? 'won' : 'lost', { points: this.totals[0]! });
      return;
    }
    this.phase = 'between';
    this.render();
  }

  protected override onAction(action: string, value: string) {
    if (action === 'next' && this.phase === 'between') {
      this.startRound();
      this.render();
      return;
    }
    if (action !== 'card') return;
    const card = this.hands[0]![Number(value)]!;
    if (this.phase === 'pass') {
      const idx = this.passing.findIndex((c) => sameCard(c, card));
      if (idx >= 0) this.passing.splice(idx, 1);
      else if (this.passing.length < 3) this.passing.push(card);
      if (this.passing.length === 3) {
        this.render();
        this.schedule(300, () => {
          this.doPass();
          this.render();
        });
      }
      this.render();
      return;
    }
    if (this.phase === 'play' && this.turn === 0 && this.trick.length < 4 && legalPlays(this.context(0)).some((c) => sameCard(c, card))) this.play(0, card);
  }

  protected view() {
    const legal = this.phase === 'play' && this.turn === 0 && this.trick.length < 4 ? legalPlays(this.context(0)) : [];
    const hand = this.hands[0]!
      .map((c, i) => {
        const selectable = this.phase === 'pass' || legal.some((x) => sameCard(x, c));
        return cardHtml(c, { action: 'card', value: i, selected: this.passing.some((x) => sameCard(x, c)), dim: this.phase === 'play' && !selectable, disabled: this.phase === 'play' && !selectable });
      })
      .join('');
    const slot = (p: number) => {
      const t = this.trick.find((x) => x.player === p);
      return `<div class="pv-col"><span class="pv-muted">${NAMES[p]} · ${this.hands[p]!.length} cards</span>${t ? cardHtml(t.card, { label: `${NAMES[p]} played ${cardName(t.card)}` }) : cardHtml(null, { label: `${NAMES[p]} has not played` })}</div>`;
    };
    const scores = NAMES.map((n, i) => `<span>${n} <b>${this.totals[i]}</b>${this.roundPoints[i] ? ` <small>(+${this.roundPoints[i]})</small>` : ''}</span>`).join('');
    return `
      <div class="pv-hud">${scores}</div>
      <p class="pv-msg" role="status">${this.message}${this.phase === 'play' && this.turn === 0 && this.trick.length < 4 ? ' Your turn.' : ''}</p>
      <div style="--cw:clamp(40px,11vw,58px);display:grid;grid-template-areas:'. n .' 'w . e' '. s .';gap:6px;align-items:center;justify-items:center">
        <div style="grid-area:n">${slot(2)}</div><div style="grid-area:w">${slot(1)}</div><div style="grid-area:e">${slot(3)}</div><div style="grid-area:s">${slot(0)}</div>
      </div>
      ${this.phase === 'between' ? '<button type="button" class="pv-btn primary" data-action="next" data-value="">Next round</button>' : ''}
      <div class="pv-row" style="--cw:clamp(30px,6.8vw,52px);gap:3px">${hand}</div>
      <p class="pv-muted">Avoid hearts (1 point each) and the Q♠ (13). First to ${TARGET} ends the game — lowest total wins.</p>`;
  }
}

export default defineGame(
  { key: 'hearts', engine: 'DOM', aspectRatio: 1, maxScore: 100 * 4 + 300, controls: [{ action: 'Play / pass', keys: 'Click cards' }] },
  (host) => new Hearts(host),
);
