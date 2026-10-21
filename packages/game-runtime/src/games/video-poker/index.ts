import type { GameHost } from '../../interfaces/game-module';
import { cardHtml, shuffledDeck, type Card } from '../../kit/cards';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { evaluatePoker, HAND_LABELS, PAYTABLE, type HandRank } from '../../kit/poker';

const START = 100;
const HANDS = 20;

class VideoPoker extends DomGame {
  private credits = START;
  private betSize = 1;
  private deck: Card[] = [];
  private hand: Card[] = [];
  private held = [false, false, false, false, false];
  private phase: 'bet' | 'hold' = 'bet';
  private handsPlayed = 0;
  private result: HandRank | null = null;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.credits = START;
    this.betSize = 1;
    this.hand = [];
    this.held = [false, false, false, false, false];
    this.phase = 'bet';
    this.handsPlayed = 0;
    this.result = null;
    this.setScore(START);
  }

  private deal() {
    if (this.credits < this.betSize) return;
    this.credits -= this.betSize;
    this.deck = shuffledDeck(this.random);
    this.hand = this.deck.splice(0, 5);
    this.held = [false, false, false, false, false];
    this.phase = 'hold';
    this.result = evaluatePoker(this.hand);
    this.sfx.click();
  }

  private drawCards() {
    this.hand = this.hand.map((c, i) => (this.held[i] ? c : this.deck.pop()!));
    this.result = evaluatePoker(this.hand);
    const win = PAYTABLE[this.result] * this.betSize;
    this.credits += win;
    this.handsPlayed++;
    this.phase = 'bet';
    this.setScore(this.credits);
    if (win) this.sfx.good();
    if (this.handsPlayed >= HANDS || this.credits < 1) {
      this.end(this.credits > START ? 'won' : 'completed', { credits: this.credits });
    }
  }

  protected override onAction(action: string, value: string) {
    if (action === 'bet' && this.phase === 'bet') this.betSize = Number(value);
    else if (action === 'deal') this.phase === 'bet' ? this.deal() : this.drawCards();
    else if (action === 'hold' && this.phase === 'hold') this.held[Number(value)] = !this.held[Number(value)];
    if (!this.finished) this.render();
  }

  protected override onKey(e: KeyboardEvent) {
    if (/^[1-5]$/.test(e.key) && this.phase === 'hold') {
      const i = Number(e.key) - 1;
      this.held[i] = !this.held[i];
      this.render();
      return true;
    }
    if (e.key === 'Enter') {
      this.onAction('deal', '');
      return true;
    }
    return false;
  }

  protected view() {
    const cards = this.hand.length
      ? this.hand.map((c, i) => `<div class="pv-col">${cardHtml(c, { action: 'hold', value: i, selected: this.held[i] })}<span class="pv-muted" style="min-height:1.2em">${this.held[i] ? 'HELD' : ''}</span></div>`).join('')
      : Array.from({ length: 5 }, () => cardHtml(null, { faceDown: true })).join('');
    const table = (Object.keys(PAYTABLE) as HandRank[])
      .filter((k) => k !== 'nothing')
      .map((k) => `<tr style="${this.result === k && this.phase === 'bet' ? 'color:#facc15;font-weight:800' : ''}"><td style="padding:1px 10px">${HAND_LABELS[k]}</td><td style="text-align:right">${PAYTABLE[k] * this.betSize}</td></tr>`)
      .join('');
    const status = this.result ? (this.phase === 'hold' ? `Dealt: ${HAND_LABELS[this.result]} — hold cards, then Draw` : `${HAND_LABELS[this.result]}${PAYTABLE[this.result] ? ` — won ${PAYTABLE[this.result] * this.betSize}` : ''}`) : 'Practice credits only — no real money.';
    return `
      <div class="pv-hud"><span>Credits <b>${this.credits}</b></span><span>Hand <b>${Math.min(this.handsPlayed + 1, HANDS)}/${HANDS}</b></span></div>
      <table class="pv-panel" style="font-size:13px;border-collapse:collapse">${table}</table>
      <div class="pv-row" style="--cw:clamp(48px,14vw,76px)">${cards}</div>
      <p class="pv-msg" role="status">${status}</p>
      <div class="pv-row">${[1, 2, 3, 4, 5].map((b) => `<button type="button" class="pv-btn small${b === this.betSize ? ' primary' : ''}" data-action="bet" data-value="${b}" ${this.phase !== 'bet' || b > this.credits ? 'disabled' : ''}>Bet ${b}</button>`).join('')}</div>
      <button type="button" class="pv-btn primary" style="min-width:180px" data-action="deal" data-value="">${this.phase === 'bet' ? 'Deal' : 'Draw'}</button>
      <p class="pv-muted">Keys 1–5 hold cards · Enter deals/draws</p>`;
  }
}

export default defineGame(
  { key: 'video-poker', engine: 'DOM', aspectRatio: 0.9, maxScore: 100 + 20 * 5 * 250, scoreLabel: 'Credits', controls: [{ action: 'Hold', keys: 'Click cards / 1–5' }, { action: 'Deal / Draw', keys: 'Enter' }] },
  (host) => new VideoPoker(host),
);
