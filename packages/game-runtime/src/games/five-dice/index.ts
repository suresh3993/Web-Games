import type { GameHost } from '../../interfaces/game-module';
import { dieHtml } from '../../kit/dice';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { CATEGORIES, cardTotal, LABELS, scoreCategory, type Category } from './logic';

type Card = Partial<Record<Category, number>>;

class FiveDice extends DomGame {
  private players: 1 | 2 = 1;
  private cards: Card[] = [{}, {}];
  private turn = 0;
  private dice = [1, 1, 1, 1, 1];
  private held = [false, false, false, false, false];
  private rolls = 0;
  private started = false;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.cards = [{}, {}];
    this.turn = 0;
    this.started = false;
    this.newTurn();
  }

  private newTurn() {
    this.held = [false, false, false, false, false];
    this.rolls = 0;
  }

  private roll() {
    if (this.rolls >= 3) return;
    this.dice = this.dice.map((d, i) => (this.held[i] ? d : 1 + Math.floor(this.random() * 6)));
    this.rolls++;
    this.started = true;
    this.sfx.beep(300 + this.rolls * 80, 0.05, 'square', 0.04);
  }

  private choose(cat: Category) {
    const card = this.cards[this.turn]!;
    if (this.rolls === 0 || card[cat] !== undefined) return;
    card[cat] = scoreCategory(cat, this.dice);
    if (this.turn === 0) this.setScore(cardTotal(card).total);
    this.sfx.click();
    const done = (c: Card) => CATEGORIES.every((k) => c[k] !== undefined);
    if (this.players === 2) this.turn = this.turn === 0 ? 1 : 0;
    if (done(this.cards[0]!) && (this.players === 1 || done(this.cards[1]!))) {
      if (this.players === 1) {
        this.setScore(cardTotal(this.cards[0]!).total);
        this.end('completed', { total: this.score });
      } else {
        this.end('completed');
      }
      return;
    }
    this.newTurn();
  }

  protected override onAction(action: string, value: string) {
    if (action === 'players' && !this.started) {
      this.players = Number(value) as 1 | 2;
      this.reset();
    } else if (action === 'roll') this.roll();
    else if (action === 'hold' && this.rolls > 0 && this.rolls < 3) this.held[Number(value)] = !this.held[Number(value)];
    else if (action === 'cat') this.choose(value as Category);
    if (!this.finished) this.render();
  }

  protected override onKey(e: KeyboardEvent) {
    if (e.key === ' ' || e.key === 'Enter') {
      this.onAction('roll', '');
      return true;
    }
    if (/^[1-5]$/.test(e.key)) {
      this.onAction('hold', String(Number(e.key) - 1));
      return true;
    }
    return false;
  }

  protected view() {
    const card = this.cards[this.turn]!;
    const rows = CATEGORIES.map((cat) => {
      const cells = [0, 1].slice(0, this.players).map((p) => {
        const v = this.cards[p]![cat];
        const preview = p === this.turn && v === undefined && this.rolls > 0 ? scoreCategory(cat, this.dice) : null;
        return p === this.turn && v === undefined
          ? `<td><button type="button" class="pv-btn small" style="min-width:56px" data-action="cat" data-value="${cat}" ${this.rolls ? '' : 'disabled'}>${preview ?? '—'}</button></td>`
          : `<td style="text-align:center;font-weight:700">${v ?? ''}</td>`;
      });
      return `<tr><td style="padding:2px 8px">${LABELS[cat]}</td>${cells.join('')}</tr>`;
    }).join('');
    const totals = [0, 1].slice(0, this.players).map((p) => {
      const t = cardTotal(this.cards[p]!);
      return `<td style="text-align:center;font-weight:800">${t.total}${t.bonus ? ' (+35)' : ''}</td>`;
    });
    const dice = this.dice.map((d, i) => dieHtml(this.rolls ? d : 0, { action: 'hold', index: i, held: this.held[i], disabled: this.rolls === 0 || this.rolls >= 3 })).join('');
    return `
      <div class="pv-row">${[1, 2].map((n) => `<button type="button" class="pv-btn small${n === this.players ? ' primary' : ''}" data-action="players" data-value="${n}" ${this.started ? 'disabled' : ''}>${n === 1 ? 'Solo' : '2 Players'}</button>`).join('')}</div>
      <p class="pv-msg">${this.players === 2 ? `Player ${this.turn + 1}'s turn · ` : ''}Roll ${this.rolls}/3 — click dice to hold, then pick a box.</p>
      <div class="pv-row">${dice}</div>
      <button type="button" class="pv-btn primary" style="min-width:180px" data-action="roll" data-value="" ${this.rolls >= 3 ? 'disabled' : ''}>🎲 Roll${this.rolls ? ' again' : ''}</button>
      <table class="pv-panel" style="font-size:14px;border-collapse:collapse">
        <tr><th></th>${[0, 1].slice(0, this.players).map((p) => `<th>${this.players === 1 ? 'Score' : `P${p + 1}`}</th>`).join('')}</tr>
        ${rows}<tr><td style="padding:4px 8px"><b>Total</b> <span class="pv-muted">(upper ${cardTotal(card).upper}/63)</span></td>${totals.join('')}</tr></table>`;
  }
}

export default defineGame(
  { key: 'five-dice', engine: 'DOM', aspectRatio: 0.7, maxScore: 1_575, controls: [{ action: 'Roll', keys: 'Space / Roll button' }, { action: 'Hold die', keys: 'Click / 1–5' }] },
  (host) => new FiveDice(host),
);
