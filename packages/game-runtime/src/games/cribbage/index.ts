import type { GameHost } from '../../interfaces/game-module';
import { cardHtml, cardName, shuffledDeck, type Card } from '../../kit/cards';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { chooseDiscard, choosePeg, pegPoints, pegValue, scoreHand } from './logic';

const TARGET = 121;
const WHO = ['You', 'Computer'];

class Cribbage extends DomGame {
  private scores = [0, 0];
  private dealer = 1;
  private hands: Card[][] = [[], []];
  private kept: Card[][] = [[], []];
  private crib: Card[] = [];
  private starter: Card | null = null;
  private phase: 'discard' | 'peg' | 'show' = 'discard';
  private selected: Card[] = [];
  private pile: Card[] = [];
  private turn = 0;
  private passed = [false, false];
  private lastPlayer = -1;
  private log: string[] = [];

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.scores = [0, 0];
    this.dealer = 1;
    this.log = [];
    this.deal();
  }

  private say(s: string) {
    this.log = [s, ...this.log].slice(0, 6);
  }

  private peg(p: number, points: number, why: string) {
    if (!points || this.finished) return;
    this.scores[p]! += points;
    if (p === 0) this.setScore(this.scores[0]!);
    this.say(`${WHO[p]} +${points} (${why})`);
    if (this.scores[p]! >= TARGET) {
      const won = p === 0;
      this.setScore(won ? TARGET + Math.max(0, TARGET - this.scores[1]!) * 2 : this.scores[0]!);
      this.say(won ? 'You reached 121 — you win! 🎉' : 'The computer reached 121.');
      if (won) this.sfx.win();
      this.end(won ? 'won' : 'lost', { you: this.scores[0]!, cpu: this.scores[1]! });
    }
  }

  private deal() {
    const deck = shuffledDeck(this.random);
    this.hands = [deck.slice(0, 6), deck.slice(6, 12)];
    this.starter = deck[12]!;
    this.hands.forEach((h) => h.sort((a, b) => a.rank - b.rank));
    this.crib = [];
    this.pile = [];
    this.selected = [];
    this.passed = [false, false];
    this.phase = 'discard';
    this.say(`${WHO[this.dealer]} deal${this.dealer === 0 ? '' : 's'}. Choose two cards for the ${this.dealer === 0 ? 'your' : "computer's"} crib.`);
  }

  private afterDiscard() {
    const cpuToss = chooseDiscard(this.hands[1]!, this.dealer === 1);
    this.hands[1] = this.hands[1]!.filter((c) => !cpuToss.includes(c));
    this.crib = [...this.selected, ...cpuToss];
    this.hands[0] = this.hands[0]!.filter((c) => !this.selected.includes(c));
    this.kept = [[...this.hands[0]!], [...this.hands[1]!]];
    this.selected = [];
    this.phase = 'peg';
    this.say(`Starter: ${cardName(this.starter!)}`);
    if (this.starter!.rank === 11) this.peg(this.dealer, 2, 'his heels');
    this.turn = 1 - this.dealer;
    this.pile = [];
    this.lastPlayer = -1;
    this.nextPeg();
  }

  private get count() {
    return this.pile.reduce((n, c) => n + pegValue(c), 0);
  }

  private canPlay(p: number) {
    return this.hands[p]!.some((c) => this.count + pegValue(c) <= 31);
  }

  private play(p: number, card: Card) {
    this.hands[p] = this.hands[p]!.filter((c) => c !== card);
    this.pile.push(card);
    this.lastPlayer = p;
    this.sfx.click();
    const { points, reasons } = pegPoints(this.pile);
    this.peg(p, points, reasons.join(', '));
    if (this.finished) return;
    if (this.count === 31) this.resetCount(false);
    this.turn = 1 - p;
    this.nextPeg();
  }

  private resetCount(goPoint: boolean) {
    if (goPoint && this.lastPlayer >= 0 && this.count < 31) this.peg(this.lastPlayer, 1, 'go');
    this.pile = [];
    this.passed = [false, false];
  }

  private nextPeg(): void {
    if (this.finished) return;
    if (!this.hands[0]!.length && !this.hands[1]!.length) {
      this.resetCount(true);
      return this.show();
    }
    if (!this.canPlay(this.turn)) {
      this.passed[this.turn] = true;
      if (!this.canPlay(1 - this.turn)) {
        this.resetCount(true);
        if (this.finished) return;
        // After a "go", the player who did not play the last card leads the next count.
        if (this.lastPlayer >= 0) this.turn = 1 - this.lastPlayer;
        if (!this.hands[this.turn]!.length) this.turn = 1 - this.turn;
        return this.nextPeg();
      }
      if (this.turn === 0) this.say('You say "Go".');
      this.turn = 1 - this.turn;
    }
    if (this.turn === 1) {
      this.render();
      this.schedule(650, () => {
        const c = choosePeg(this.hands[1]!, this.pile);
        if (c) this.play(1, c);
        else this.nextPeg();
      });
    } else this.render();
  }

  private show() {
    this.phase = 'show';
    const order = [1 - this.dealer, this.dealer];
    for (const p of order) {
      const s = scoreHand(this.kept[p]!, this.starter);
      this.peg(p, s.total, 'hand');
      if (this.finished) return;
    }
    const crib = scoreHand(this.crib, this.starter, true);
    this.peg(this.dealer, crib.total, 'crib');
    if (!this.finished) this.render();
  }

  protected override onAction(action: string, value: string) {
    if (action === 'card') {
      const card = this.hands[0]![Number(value)]!;
      if (this.phase === 'discard') {
        const i = this.selected.indexOf(card);
        if (i >= 0) this.selected.splice(i, 1);
        else if (this.selected.length < 2) this.selected.push(card);
      } else if (this.phase === 'peg' && this.turn === 0 && this.count + pegValue(card) <= 31) {
        return this.play(0, card);
      }
    } else if (action === 'discard' && this.selected.length === 2) return this.afterDiscard();
    else if (action === 'next' && this.phase === 'show') {
      this.dealer = 1 - this.dealer;
      this.deal();
    }
    this.render();
  }

  protected view() {
    const handCards = this.hands[0]!.map((c, i) => cardHtml(c, { action: 'card', value: i, selected: this.selected.includes(c), dim: this.phase === 'peg' && (this.turn !== 0 || this.count + pegValue(c) > 31) })).join('');
    const showHands = this.phase === 'show'
      ? `<div class="pv-row">${[0, 1].map((p) => `<div class="pv-col"><span class="pv-muted">${WHO[p]} (${scoreHand(this.kept[p]!, this.starter).total})</span><div class="pv-row" style="gap:3px">${this.kept[p]!.map((c) => cardHtml(c)).join('')}</div></div>`).join('')}
         <div class="pv-col"><span class="pv-muted">Crib (${scoreHand(this.crib, this.starter, true).total})</span><div class="pv-row" style="gap:3px">${this.crib.map((c) => cardHtml(c)).join('')}</div></div></div>`
      : '';
    const track = (p: number) => `<div style="flex:1;height:10px;background:#141b3a;border-radius:6px;overflow:hidden"><i style="display:block;height:100%;width:${Math.min(100, (this.scores[p]! / TARGET) * 100)}%;background:${p ? '#f472b6' : '#22d3ee'}"></i></div>`;
    return `
      <div style="width:min(100%,560px)" class="pv-col">
        <div class="pv-row" style="width:100%;flex-wrap:nowrap"><b style="min-width:110px">You ${this.scores[0]}</b>${track(0)}</div>
        <div class="pv-row" style="width:100%;flex-wrap:nowrap"><b style="min-width:110px">Computer ${this.scores[1]}</b>${track(1)}</div>
      </div>
      <div class="pv-row" style="--cw:clamp(40px,10vw,58px)">
        <div class="pv-col"><span class="pv-muted">Starter</span>${this.phase === 'discard' ? cardHtml(null, { faceDown: true }) : cardHtml(this.starter)}</div>
        <div class="pv-col"><span class="pv-muted">Count ${this.count}</span><div class="pv-row" style="gap:2px">${this.pile.map((c) => cardHtml(c)).join('') || cardHtml(null)}</div></div>
        <div class="pv-col"><span class="pv-muted">Computer</span><div class="pv-row" style="gap:0">${this.hands[1]!.map(() => '<div class="pv-card back" style="--cw:26px;margin-left:-10px"></div>').join('')}</div></div>
      </div>
      ${showHands}
      <div class="pv-panel" style="width:min(100%,520px);font-size:14px" role="log">${this.log.map((l, i) => `<div style="opacity:${1 - i * 0.14}">${l}</div>`).join('')}</div>
      <div class="pv-row" style="--cw:clamp(44px,11vw,64px);gap:4px">${handCards}</div>
      ${this.phase === 'discard' ? `<button type="button" class="pv-btn primary" data-action="discard" data-value="" ${this.selected.length === 2 ? '' : 'disabled'}>Send 2 to crib</button>` : ''}
      ${this.phase === 'show' && !this.finished ? '<button type="button" class="pv-btn primary" data-action="next" data-value="">Next deal</button>' : ''}`;
  }
}

export default defineGame(
  { key: 'cribbage', engine: 'DOM', aspectRatio: 0.85, maxScore: TARGET + TARGET * 2, controls: [{ action: 'Discard / play', keys: 'Click cards' }] },
  (host) => new Cribbage(host),
);
