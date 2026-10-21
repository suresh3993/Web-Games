import type { GameHost } from '../../interfaces/game-module';
import { cardHtml } from '../../kit/cards';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { formatTime } from '../../kit/util';
import { autoMove, deal, draw, move, won, type Klondike, type PileRef } from './logic';

class KlondikeGame extends DomGame {
  private game!: Klondike;
  private drawCount: 1 | 3 = 1;
  private selected: PileRef | null = null;
  private history: { game: Klondike; score: number }[] = [];
  private moves = 0;
  private shownSecond = -1;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.game = deal(this.random);
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

  private commit(game: Klondike, points: number) {
    this.history.push({ game: this.game, score: this.score });
    this.game = game;
    this.moves++;
    this.selected = null;
    if (points) this.addScore(points);
    this.sfx.click();
    if (won(this.game)) {
      this.addScore(Math.max(0, 700 - Math.floor(this.elapsed)) * 2);
      this.sfx.win();
      this.end('won', { moves: this.moves, seconds: Math.floor(this.elapsed) });
      return;
    }
    this.render();
  }

  private tryMoveTo(dest: { kind: 'tableau' | 'foundation'; index: number }) {
    if (!this.selected) return false;
    const res = move(this.game, this.selected, dest);
    if (res) {
      this.commit(res.game, res.points);
      return true;
    }
    return false;
  }

  protected override onAction(action: string, value: string) {
    if (action === 'mode' && !this.moves) {
      this.drawCount = Number(value) as 1 | 3;
      this.render();
      return;
    }
    if (action === 'stock') {
      this.selected = null;
      this.commit(draw(this.game, this.drawCount), 0);
      return;
    }
    if (action === 'undo' && this.history.length) {
      const prev = this.history.pop()!;
      this.game = prev.game;
      this.setScore(prev.score);
      this.selected = null;
      this.render();
      return;
    }
    if (action === 'auto') {
      let res = autoMove(this.game);
      if (!res) return;
      while (res) {
        this.commit(res.game, res.points);
        if (this.finished) return;
        res = autoMove(this.game);
      }
      return;
    }
    if (action === 'waste') {
      this.selected = this.selected?.kind === 'waste' ? null : { kind: 'waste' };
      this.render();
      return;
    }
    if (action === 'foundation') {
      const index = Number(value);
      if (this.tryMoveTo({ kind: 'foundation', index })) return;
      this.selected = this.game.foundations[index]!.length ? { kind: 'foundation', index } : null;
      this.render();
      return;
    }
    if (action === 'tab') {
      const [t, k] = value.split(':').map(Number) as [number, number];
      if (this.tryMoveTo({ kind: 'tableau', index: t })) return;
      const card = this.game.tableau[t]![k];
      this.selected = card?.up ? { kind: 'tableau', index: t, from: k } : null;
      this.render();
    }
  }

  private isSel(ref: PileRef) {
    const s = this.selected;
    if (!s || s.kind !== ref.kind) return false;
    if (s.kind === 'waste') return true;
    if (s.kind === 'foundation' && ref.kind === 'foundation') return s.index === ref.index;
    return s.kind === 'tableau' && ref.kind === 'tableau' && s.index === ref.index && ref.from >= s.from;
  }

  protected view() {
    const g = this.game;
    const stock = g.stock.length ? cardHtml(g.stock[0]!, { faceDown: true, action: 'stock', label: `Stock (${g.stock.length} cards) — draw` }) : cardHtml(null, { action: 'stock', label: 'Recycle waste' });
    const top = g.waste.at(-1);
    const waste = top ? cardHtml(top, { action: 'waste', selected: this.isSel({ kind: 'waste' }) }) : cardHtml(null);
    const foundations = g.foundations
      .map((f, i) => cardHtml(f.at(-1) ?? null, { action: 'foundation', value: i, selected: this.isSel({ kind: 'foundation', index: i }), label: f.length ? undefined : 'Empty foundation' }))
      .join('');
    const tableau = g.tableau
      .map((pile, t) => {
        if (!pile.length) return `<div class="pv-stack">${cardHtml(null, { action: 'tab', value: `${t}:0`, label: 'Empty column' })}</div>`;
        return `<div class="pv-stack">${pile.map((c, k) => cardHtml(c, { faceDown: !c.up, action: 'tab', value: `${t}:${k}`, selected: c.up && this.isSel({ kind: 'tableau', index: t, from: k }) })).join('')}</div>`;
      })
      .join('');
    const modes = ([1, 3] as const).map((n) => `<button type="button" class="pv-btn small${n === this.drawCount ? ' primary' : ''}" data-action="mode" data-value="${n}" ${this.moves ? 'disabled' : ''}>Draw ${n}</button>`).join('');
    return `
      <div class="pv-row">${modes}
        <button type="button" class="pv-btn small" data-action="undo" data-value="" ${this.history.length ? '' : 'disabled'}>↶ Undo</button>
        <button type="button" class="pv-btn small" data-action="auto" data-value="">⇧ Auto to foundations</button></div>
      <div class="pv-hud"><span>Score <b>${this.score}</b></span><span>Moves <b>${this.moves}</b></span><span>Time <b>${formatTime(this.elapsed)}</b></span></div>
      <div style="--cw:clamp(38px,11vw,64px);display:grid;grid-template-columns:repeat(7,var(--cw));gap:clamp(4px,1.4vw,12px);justify-content:center">
        ${stock}${waste}<div></div>${foundations}
      </div>
      <div style="--cw:clamp(38px,11vw,64px);display:grid;grid-template-columns:repeat(7,var(--cw));gap:clamp(4px,1.4vw,12px);justify-content:center;align-items:start">${tableau}</div>
      <p class="pv-muted">Click a card (or run) to select it, then click where it should go. Click the stock to draw.</p>`;
  }
}

export default defineGame(
  { key: 'klondike-solitaire', engine: 'DOM', aspectRatio: 0.95, maxScore: 5_000, controls: [{ action: 'Move cards', keys: 'Click source, then destination' }] },
  (host) => new KlondikeGame(host),
);
