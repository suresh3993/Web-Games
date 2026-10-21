import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { shuffle } from '../../kit/util';

type Tile = [number, number];
const TARGET = 100;
const NAMES = ['You', 'Computer'];

export const fullSet = (): Tile[] => {
  const tiles: Tile[] = [];
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) tiles.push([a, b]);
  return tiles;
};
export const pips = (hand: Tile[]) => hand.reduce((s, [a, b]) => s + a + b, 0);

/** Where a tile can go given the open ends ('left' / 'right'); empty line accepts anything. */
export function placements(tile: Tile, ends: [number, number] | null): ('left' | 'right')[] {
  if (!ends) return ['right'];
  const out: ('left' | 'right')[] = [];
  if (tile.includes(ends[0])) out.push('left');
  if (tile.includes(ends[1])) out.push('right');
  return out;
}

class Dominoes extends DomGame {
  private hands: Tile[][] = [[], []];
  private boneyard: Tile[] = [];
  private line: Tile[] = [];
  private turn = 0;
  private scores = [0, 0];
  private selected = -1;
  private message = '';
  private passes = 0;
  private roundOver = false;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.scores = [0, 0];
    this.newRound();
  }

  private newRound() {
    const set = shuffle(this.random, fullSet());
    this.hands = [set.slice(0, 7), set.slice(7, 14)];
    this.boneyard = set.slice(14);
    this.line = [];
    this.selected = -1;
    this.passes = 0;
    this.roundOver = false;
    // Highest double leads.
    let lead = 0;
    let best = -1;
    this.hands.forEach((h, p) => h.forEach(([a, b]) => a === b && a > best && ((best = a), (lead = p))));
    this.turn = lead;
    this.message = `${NAMES[lead]} lead${lead === 0 ? '' : 's'} (highest double).`;
    if (this.turn === 1) this.schedule(800, () => this.cpuTurn());
  }

  private get ends(): [number, number] | null {
    return this.line.length ? [this.line[0]![0], this.line.at(-1)![1]] : null;
  }

  private place(p: number, index: number, side: 'left' | 'right') {
    const tile = this.hands[p]![index]!;
    const ends = this.ends;
    let t: Tile = [...tile];
    if (ends) {
      if (side === 'left') t = t[1] === ends[0] ? t : [t[1], t[0]];
      else t = t[0] === ends[1] ? t : [t[1], t[0]];
    }
    if (side === 'left') this.line.unshift(t);
    else this.line.push(t);
    this.hands[p]!.splice(index, 1);
    this.passes = 0;
    this.sfx.click();
    if (!this.hands[p]!.length) return this.endRound(p, 'domino');
    this.nextTurn();
  }

  private playable(p: number) {
    return this.hands[p]!.flatMap((t, i) => placements(t, this.ends).map((side) => ({ i, side })));
  }

  /** Draw until a playable tile appears or the boneyard is empty; returns true if the player can now play. */
  private drawUntilPlayable(p: number) {
    while (!this.playable(p).length && this.boneyard.length) this.hands[p]!.push(this.boneyard.pop()!);
    return this.playable(p).length > 0;
  }

  private nextTurn() {
    this.turn = this.turn === 0 ? 1 : 0;
    this.selected = -1;
    if (this.turn === 1) this.schedule(700, () => this.cpuTurn());
    this.render();
  }

  private pass(p: number) {
    this.passes++;
    this.message = `${NAMES[p]} cannot play and pass${p === 0 ? '' : 'es'}.`;
    if (this.passes >= 2) {
      const a = pips(this.hands[0]!);
      const b = pips(this.hands[1]!);
      return this.endRound(a === b ? -1 : a < b ? 0 : 1, 'blocked');
    }
    this.nextTurn();
  }

  private cpuTurn() {
    if (this.roundOver || this.finished) return;
    if (!this.drawUntilPlayable(1)) return this.pass(1);
    // Play the heaviest playable tile (sheds pips), preferring doubles.
    const moves = this.playable(1).sort((x, y) => {
      const tx = this.hands[1]![x.i]!;
      const ty = this.hands[1]![y.i]!;
      return ty[0] + ty[1] + (ty[0] === ty[1] ? 3 : 0) - (tx[0] + tx[1] + (tx[0] === tx[1] ? 3 : 0));
    });
    const m = moves[0]!;
    this.message = 'Computer played.';
    this.place(1, m.i, m.side);
  }

  private endRound(winner: number, how: 'domino' | 'blocked') {
    this.roundOver = true;
    if (winner >= 0) {
      const loser = winner === 0 ? 1 : 0;
      const pts = how === 'domino' ? pips(this.hands[loser]!) : Math.abs(pips(this.hands[0]!) - pips(this.hands[1]!));
      this.scores[winner]! += pts;
      this.message = `${NAMES[winner]} win${winner === 0 ? '' : 's'} the round${how === 'blocked' ? ' (blocked game, fewer pips)' : ''} for ${pts} points.`;
    } else this.message = 'Blocked game — tie, no points.';
    this.setScore(this.scores[0]!);
    if (Math.max(...this.scores) >= TARGET) {
      const won = this.scores[0]! >= TARGET;
      if (won) {
        this.setScore(this.scores[0]! + 200);
        this.sfx.win();
      }
      this.end(won ? 'won' : 'lost', { you: this.scores[0]!, cpu: this.scores[1]! });
      return;
    }
    this.render();
  }

  protected override onAction(action: string, value: string) {
    if (action === 'next' && this.roundOver) {
      this.newRound();
      return this.render();
    }
    if (this.turn !== 0 || this.roundOver) return;
    if (action === 'tile') {
      const i = Number(value);
      const options = placements(this.hands[0]![i]!, this.ends);
      if (options.length === 1) return this.place(0, i, options[0]!);
      this.selected = options.length ? i : -1;
      this.message = options.length ? 'Choose which end to play on.' : "That tile doesn't match either end.";
    } else if (action === 'end' && this.selected >= 0) return this.place(0, this.selected, value as 'left' | 'right');
    else if (action === 'draw') {
      if (this.playable(0).length) this.message = 'You have a playable tile.';
      else if (this.boneyard.length) {
        this.hands[0]!.push(this.boneyard.pop()!);
        this.message = 'You drew a tile.';
      } else return this.pass(0);
    }
    this.render();
  }

  private tileHtml(t: Tile, opts: { action?: string; index?: number; vertical?: boolean; selected?: boolean; dim?: boolean } = {}) {
    const tag = opts.action ? 'button' : 'span';
    const attrs = opts.action ? ` type="button" data-action="${opts.action}" data-value="${opts.index}"` : '';
    return `<${tag}${attrs} aria-label="Domino ${t[0]}-${t[1]}" style="all:unset;${opts.action ? 'cursor:pointer;' : ''}display:inline-flex;flex-direction:${opts.vertical ? 'column' : 'row'};background:#f8fafc;color:#0f172a;border-radius:6px;font-weight:800;font-size:18px;${opts.selected ? 'box-shadow:0 0 0 3px #22d3ee;' : ''}${opts.dim ? 'opacity:.45;' : ''}">
      <span style="width:28px;height:28px;display:flex;align-items:center;justify-content:center">${t[0]}</span><span style="${opts.vertical ? 'border-top' : 'border-left'}:2px solid #334155;width:28px;height:28px;display:flex;align-items:center;justify-content:center">${t[1]}</span></${tag}>`;
  }

  protected view() {
    const playable = new Set(this.turn === 0 ? this.playable(0).map((m) => m.i) : []);
    const hand = this.hands[0]!.map((t, i) => this.tileHtml(t, { action: 'tile', index: i, vertical: true, selected: i === this.selected, dim: this.turn === 0 && !playable.has(i) })).join('');
    const line = this.line.map((t) => this.tileHtml(t)).join('');
    const ends = this.ends;
    return `
      <div class="pv-hud"><span>You <b>${this.scores[0]}</b></span><span>Computer <b>${this.scores[1]}</b></span><span>Boneyard <b>${this.boneyard.length}</b></span><span>CPU tiles <b>${this.hands[1]!.length}</b></span></div>
      <p class="pv-msg" role="status">${this.message}</p>
      <div class="pv-panel" style="display:flex;flex-wrap:wrap;gap:4px;justify-content:center;max-width:760px;min-height:48px">${line || '<span class="pv-muted">Play the first tile</span>'}</div>
      ${this.selected >= 0 && ends ? `<div class="pv-row"><button type="button" class="pv-btn" data-action="end" data-value="left">◀ Left end (${ends[0]})</button><button type="button" class="pv-btn" data-action="end" data-value="right">Right end (${ends[1]}) ▶</button></div>` : ''}
      <div class="pv-row">${hand}</div>
      ${this.roundOver ? '<button type="button" class="pv-btn primary" data-action="next" data-value="">Next round</button>' : `<button type="button" class="pv-btn small" data-action="draw" data-value="" ${this.turn === 0 ? '' : 'disabled'}>${this.boneyard.length ? 'Draw from boneyard' : 'Pass'}</button>`}
      <p class="pv-muted">First to ${TARGET} points. Win a round by playing all your tiles.</p>`;
  }
}

export default defineGame(
  { key: 'dominoes', engine: 'DOM', aspectRatio: 1, maxScore: 400, controls: [{ action: 'Play tile', keys: 'Click a matching tile' }] },
  (host) => new Dominoes(host),
);
