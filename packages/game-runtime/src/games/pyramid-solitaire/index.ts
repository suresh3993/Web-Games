import type { GameHost } from '../../interfaces/game-module';
import { cardHtml, shuffledDeck, type Card } from '../../kit/cards';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { exposed, pyramidSlots } from '../../kit/peaks';

const SLOTS = pyramidSlots();
const MAX_PASSES = 3;
type Pick = { from: 'pyr'; i: number } | { from: 'waste' } | { from: 'stock' };

class Pyramid extends DomGame {
  private cards: Card[] = [];
  private removed: boolean[] = [];
  private stock: Card[] = [];
  private waste: Card[] = [];
  private passes = 1;
  private pick: Pick | null = null;
  private message = '';

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    const deck = shuffledDeck(this.random);
    this.cards = deck.slice(0, 28);
    this.stock = deck.slice(28);
    this.waste = [];
    this.removed = Array(28).fill(false);
    this.passes = 1;
    this.pick = null;
    this.message = 'Remove pairs that add up to 13. Kings go alone. J=11, Q=12, K=13.';
  }

  private cardOf(p: Pick): Card | undefined {
    return p.from === 'pyr' ? this.cards[p.i] : p.from === 'waste' ? this.waste.at(-1) : this.stock.at(-1);
  }

  private remove(p: Pick) {
    if (p.from === 'pyr') this.removed[p.i] = true;
    else if (p.from === 'waste') this.waste.pop();
    else this.stock.pop();
  }

  private choose(p: Pick) {
    const card = this.cardOf(p);
    if (!card) return;
    if (card.rank === 13) {
      this.remove(p);
      this.addScore(p.from === 'pyr' ? 25 : 5);
      this.pick = null;
      this.sfx.good();
      return;
    }
    if (!this.pick) {
      this.pick = p;
      return;
    }
    const other = this.cardOf(this.pick)!;
    const same = JSON.stringify(this.pick) === JSON.stringify(p);
    if (!same && other.rank + card.rank === 13) {
      this.remove(this.pick);
      this.remove(p);
      this.addScore((this.pick.from === 'pyr' ? 25 : 5) + (p.from === 'pyr' ? 25 : 5));
      this.sfx.good();
      this.pick = null;
    } else this.pick = same ? null : p;
  }

  private stuck() {
    const playable: Card[] = [];
    SLOTS.forEach((_, i) => exposed(SLOTS, this.removed, i) && playable.push(this.cards[i]!));
    if (this.waste.length) playable.push(this.waste.at(-1)!);
    if (this.stock.length) return false;
    if (this.passes < MAX_PASSES && this.waste.length) return false;
    if (playable.some((c) => c.rank === 13)) return false;
    return !playable.some((a, i) => playable.some((b, j) => i !== j && a.rank + b.rank === 13));
  }

  protected override onAction(action: string, value: string) {
    if (action === 'pyr') {
      const i = Number(value);
      if (exposed(SLOTS, this.removed, i)) this.choose({ from: 'pyr', i });
    } else if (action === 'waste') this.choose({ from: 'waste' });
    else if (action === 'draw') {
      this.pick = null;
      if (this.stock.length) this.waste.push(this.stock.pop()!);
      else if (this.passes < MAX_PASSES) {
        this.stock = this.waste.reverse();
        this.waste = [];
        this.passes++;
      }
    }
    if (this.removed.every(Boolean)) {
      this.addScore(500 + this.stock.length * 10);
      this.sfx.win();
      this.end('won');
      return;
    }
    if (this.stuck()) {
      this.message = 'No more pairs — game over.';
      this.end('completed', { cleared: this.removed.filter(Boolean).length });
      return;
    }
    this.render();
  }

  protected view() {
    const rows = Array.from({ length: 7 }, (_, r) => {
      const cards = SLOTS.map((s, i) => ({ s, i }))
        .filter(({ s }) => s.row === r)
        .map(({ i }) => {
          if (this.removed[i]) return '<div class="pv-card" style="visibility:hidden"></div>';
          const open = exposed(SLOTS, this.removed, i);
          return cardHtml(this.cards[i]!, { action: 'pyr', value: i, dim: !open, selected: this.pick?.from === 'pyr' && this.pick.i === i, disabled: !open });
        })
        .join('');
      return `<div class="pv-row" style="flex-wrap:nowrap;gap:6px;margin-top:${r ? 'calc(var(--cw) * -0.75)' : '0'}">${cards}</div>`;
    }).join('');
    const top = this.waste.at(-1);
    return `
      <div class="pv-hud"><span>Score <b>${this.score}</b></span><span>Stock <b>${this.stock.length}</b></span><span>Pass <b>${this.passes}/${MAX_PASSES}</b></span></div>
      <p class="pv-msg">${this.message}</p>
      <div style="--cw:clamp(34px,9.5vw,56px);display:flex;flex-direction:column;align-items:center">${rows}</div>
      <div class="pv-row" style="--cw:clamp(40px,11vw,60px)">
        ${this.stock.length || this.passes < MAX_PASSES ? cardHtml(this.stock.at(-1) ?? null, { faceDown: !!this.stock.length, action: 'draw', label: this.stock.length ? 'Draw from stock' : 'Recycle waste' }) : cardHtml(null)}
        ${top ? cardHtml(top, { action: 'waste', selected: this.pick?.from === 'waste' }) : cardHtml(null)}
      </div>`;
  }
}

export default defineGame(
  { key: 'pyramid-solitaire', engine: 'DOM', aspectRatio: 0.95, maxScore: 2_000, controls: [{ action: 'Pair', keys: 'Click two cards totalling 13' }] },
  (host) => new Pyramid(host),
);
