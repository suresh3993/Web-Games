import type { GameHost } from '../../interfaces/game-module';
import { cardHtml, isRed, shuffledDeck, type Card } from '../../kit/cards';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { formatTime } from '../../kit/util';

type Src = { kind: 'col'; index: number; from: number } | { kind: 'cell'; index: number };

/** Max cards movable as a unit: (free cells + 1) × 2^(empty columns). */
export const capacity = (freeCells: number, emptyCols: number) => (freeCells + 1) * 2 ** emptyCols;

export function isTableauRun(cards: Card[]) {
  return cards.every((c, k) => k === 0 || (isRed(c) !== isRed(cards[k - 1]!) && c.rank === cards[k - 1]!.rank - 1));
}

class FreeCell extends DomGame {
  private cols: Card[][] = [];
  private cells: (Card | null)[] = [];
  private foundations: Card[][] = [];
  private selected: Src | null = null;
  private history: string[] = [];
  private moves = 0;
  private shownSecond = -1;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    const deck = shuffledDeck(this.random);
    this.cols = Array.from({ length: 8 }, () => []);
    deck.forEach((c, i) => this.cols[i % 8]!.push(c));
    this.cells = [null, null, null, null];
    this.foundations = [[], [], [], []];
    this.selected = null;
    this.history = [];
    this.moves = 0;
  }

  protected override onTick() {
    const s = Math.floor(this.elapsed);
    if (this.moves && s !== this.shownSecond) {
      this.shownSecond = s;
      this.render();
    }
  }

  private snapshot() {
    this.history.push(JSON.stringify({ c: this.cols, f: this.cells, d: this.foundations, s: this.score }));
  }

  private sourceCards(src: Src): Card[] {
    if (src.kind === 'cell') return this.cells[src.index] ? [this.cells[src.index]!] : [];
    return this.cols[src.index]!.slice(src.from);
  }

  private removeSource(src: Src) {
    if (src.kind === 'cell') this.cells[src.index] = null;
    else this.cols[src.index]!.splice(src.from);
  }

  private tryMove(dest: { kind: 'col' | 'cell' | 'found'; index: number }): boolean {
    if (!this.selected) return false;
    const cards = this.sourceCards(this.selected);
    if (!cards.length || !isTableauRun(cards)) return false;
    if (dest.kind === 'cell') {
      if (cards.length !== 1 || this.cells[dest.index]) return false;
    } else if (dest.kind === 'found') {
      const f = this.foundations[dest.index]!;
      const c = cards[0]!;
      if (cards.length !== 1 || !(f.length ? f.at(-1)!.suit === c.suit && c.rank === f.at(-1)!.rank + 1 : c.rank === 1)) return false;
    } else {
      if (this.selected.kind === 'col' && this.selected.index === dest.index) return false;
      const target = this.cols[dest.index]!.at(-1);
      if (target && !(isRed(target) !== isRed(cards[0]!) && cards[0]!.rank === target.rank - 1)) return false;
      const free = this.cells.filter((c) => !c).length;
      const empty = this.cols.filter((c, i) => !c.length && i !== dest.index).length;
      if (cards.length > capacity(free, empty)) return false;
    }
    this.snapshot();
    this.removeSource(this.selected);
    if (dest.kind === 'cell') this.cells[dest.index] = cards[0]!;
    else if (dest.kind === 'found') {
      this.foundations[dest.index]!.push(cards[0]!);
      this.addScore(10);
    } else this.cols[dest.index]!.push(...cards);
    this.moves++;
    this.selected = null;
    this.sfx.click();
    return true;
  }

  private autoFoundation() {
    let moved = true;
    while (moved) {
      moved = false;
      const sources: Src[] = [...this.cells.map((_, i) => ({ kind: 'cell', index: i }) as Src), ...this.cols.map((c, i) => ({ kind: 'col', index: i, from: c.length - 1 }) as Src)];
      for (const src of sources) {
        if (src.kind === 'col' && src.from < 0) continue;
        for (let f = 0; f < 4 && !moved; f++) {
          this.selected = src;
          if (this.tryMove({ kind: 'found', index: f })) moved = true;
        }
        if (moved) break;
      }
    }
    this.selected = null;
  }

  protected override onAction(action: string, value: string) {
    const index = Number(value.split(':')[0]);
    if (action === 'undo' && this.history.length) {
      const h = JSON.parse(this.history.pop()!);
      this.cols = h.c;
      this.cells = h.f;
      this.foundations = h.d;
      this.setScore(h.s);
      this.selected = null;
    } else if (action === 'auto') this.autoFoundation();
    else if (action === 'cell') {
      if (!this.tryMove({ kind: 'cell', index })) this.selected = this.cells[index] ? { kind: 'cell', index } : null;
    } else if (action === 'found') this.tryMove({ kind: 'found', index });
    else if (action === 'col') {
      const k = Number(value.split(':')[1]);
      if (!this.tryMove({ kind: 'col', index })) {
        const run = this.cols[index]!.slice(k);
        this.selected = run.length && isTableauRun(run) ? { kind: 'col', index, from: k } : null;
      }
    }
    if (this.foundations.every((f) => f.length === 13)) {
      this.addScore(Math.max(0, 900 - Math.floor(this.elapsed)) * 2);
      this.sfx.win();
      this.end('won', { moves: this.moves });
      return;
    }
    this.render();
  }

  protected view() {
    const sel = this.selected;
    const cells = this.cells.map((c, i) => cardHtml(c, { action: 'cell', value: i, selected: sel?.kind === 'cell' && sel.index === i, label: c ? undefined : 'Free cell' })).join('');
    const founds = this.foundations.map((f, i) => cardHtml(f.at(-1) ?? null, { action: 'found', value: i, label: f.length ? undefined : 'Foundation' })).join('');
    const cols = this.cols
      .map((pile, i) =>
        pile.length
          ? `<div class="pv-stack">${pile.map((c, k) => cardHtml(c, { action: 'col', value: `${i}:${k}`, selected: sel?.kind === 'col' && sel.index === i && k >= sel.from })).join('')}</div>`
          : `<div class="pv-stack">${cardHtml(null, { action: 'col', value: `${i}:0`, label: 'Empty column' })}</div>`,
      )
      .join('');
    const grid = 'style="--cw:clamp(34px,10vw,60px);display:grid;grid-template-columns:repeat(8,var(--cw));gap:clamp(3px,1.2vw,10px);justify-content:center;align-items:start"';
    return `
      <div class="pv-row">
        <button type="button" class="pv-btn small" data-action="undo" data-value="" ${this.history.length ? '' : 'disabled'}>↶ Undo</button>
        <button type="button" class="pv-btn small" data-action="auto" data-value="">⇧ Auto to foundations</button></div>
      <div class="pv-hud"><span>Score <b>${this.score}</b></span><span>Moves <b>${this.moves}</b></span><span>Time <b>${formatTime(this.elapsed)}</b></span>
        <span>Can move <b>${capacity(this.cells.filter((c) => !c).length, this.cols.filter((c) => !c.length).length)}</b> cards</span></div>
      <div ${grid}>${cells}${founds}</div>
      <div ${grid}>${cols}</div>`;
  }
}

export default defineGame(
  { key: 'freecell', engine: 'DOM', aspectRatio: 0.95, maxScore: 2_400, controls: [{ action: 'Move', keys: 'Click source, then destination' }] },
  (host) => new FreeCell(host),
);
