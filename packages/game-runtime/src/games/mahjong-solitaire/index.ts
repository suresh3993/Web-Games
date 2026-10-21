import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { formatTime } from '../../kit/util';
import { isFree, layout, solvableFaces, type Pos } from './logic';

/** Original tile faces (symbol + colour) — not traditional mahjong artwork. */
const FACES = ['☀', '☾', '★', '✿', '❄', '♫', '⚓', '☂', '♞', '♛', '✦', '◆', '●', '▲', '■', '♥', '♣', '♠', '☯', '⚑', '✈', '☘'];
const COLORS = ['#dc2626', '#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2'];
const KINDS = 30;

class MahjongSolitaire extends DomGame {
  private positions: Pos[] = layout();
  private faces: number[] = [];
  private present: boolean[] = [];
  private selected = -1;
  private shuffles = 3;
  private message = '';
  private shownSecond = -1;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.faces = solvableFaces(this.positions, KINDS, this.random);
    this.present = this.positions.map(() => true);
    this.selected = -1;
    this.shuffles = 3;
    this.message = 'Match pairs of identical free tiles (no tile on top, left or right side open).';
  }

  protected override onTick() {
    const s = Math.floor(this.elapsed);
    if (s !== this.shownSecond) {
      this.shownSecond = s;
      this.render();
    }
  }

  private freePairs() {
    const free = this.positions.flatMap((_, i) => (isFree(this.positions, this.present, i) ? [i] : []));
    return free.filter((a, k) => free.slice(k + 1).some((b) => this.faces[a] === this.faces[b])).length;
  }

  private reshuffle() {
    if (!this.shuffles) return;
    this.shuffles--;
    // Re-deal remaining tiles into a solvable arrangement of the remaining positions.
    const remaining = this.positions.filter((_, i) => this.present[i]);
    const faces = solvableFaces(remaining, KINDS, this.random);
    let k = 0;
    this.positions.forEach((_, i) => {
      if (this.present[i]) this.faces[i] = faces[k++]!;
    });
    this.selected = -1;
    this.message = 'Tiles reshuffled.';
  }

  protected override onAction(action: string, value: string) {
    if (action === 'shuffle') this.reshuffle();
    else if (action === 'tile') {
      const i = Number(value);
      if (!isFree(this.positions, this.present, i)) {
        this.message = 'That tile is blocked.';
        this.sfx.bad();
      } else if (this.selected < 0 || this.selected === i) {
        this.selected = this.selected === i ? -1 : i;
      } else if (this.faces[this.selected] === this.faces[i]) {
        this.present[this.selected] = this.present[i] = false;
        this.selected = -1;
        this.addScore(20);
        this.sfx.good();
        this.message = '';
        if (!this.present.some(Boolean)) {
          this.addScore(1000 + Math.max(0, 900 - Math.floor(this.elapsed)) * 2 + this.shuffles * 100);
          this.sfx.win();
          this.end('won');
          return;
        }
        if (this.freePairs() === 0) {
          if (this.shuffles) this.message = 'No more matches — use a shuffle.';
          else {
            this.message = 'No more matches and no shuffles left.';
            this.end('completed', { cleared: this.present.filter((p) => !p).length });
            return;
          }
        }
      } else this.selected = i;
    }
    this.render();
  }

  protected view() {
    const order = this.positions.map((p, i) => ({ p, i })).sort((a, b) => a.p.z - b.p.z || a.p.y - b.p.y || a.p.x - b.p.x);
    const tiles = order
      .filter(({ i }) => this.present[i])
      .map(({ p, i }) => {
        const free = isFree(this.positions, this.present, i);
        const face = this.faces[i]!;
        return `<button type="button" data-action="tile" data-value="${i}" aria-label="Tile ${FACES[face % FACES.length]}${free ? '' : ' (blocked)'}" style="all:unset;position:absolute;left:calc(${p.x} * var(--tw) - ${p.z} * 4px);top:calc(${p.y} * var(--th) - ${p.z} * 5px);width:calc(var(--tw) - 2px);height:calc(var(--th) - 2px);display:flex;align-items:center;justify-content:center;border-radius:6px;cursor:pointer;background:${i === this.selected ? '#a5f3fc' : free ? '#fdf6e3' : '#d6cfba'};color:${COLORS[face % COLORS.length]};box-shadow:${p.z * 2 + 2}px ${p.z * 2 + 3}px 0 #6b5f42;font-size:calc(var(--th) * .5);z-index:${p.z * 100 + p.y}">${FACES[face % FACES.length]}${face >= FACES.length ? '<sup style="font-size:.5em">2</sup>' : ''}</button>`;
      })
      .join('');
    return `
      <div class="pv-hud"><span>Tiles left <b>${this.present.filter(Boolean).length}</b></span><span>Pairs available <b>${this.freePairs()}</b></span><span>Time <b>${formatTime(this.elapsed)}</b></span></div>
      <p class="pv-msg" role="status">${this.message}</p>
      <div style="--tw:min(10.5vw,58px);--th:min(14vw,76px);position:relative;width:calc(8 * var(--tw) + 12px);height:calc(6 * var(--th) + 12px);margin:12px 0 0 16px">${tiles}</div>
      <button type="button" class="pv-btn small" data-action="shuffle" data-value="" ${this.shuffles ? '' : 'disabled'}>⤨ Shuffle (${this.shuffles} left)</button>`;
  }
}

export default defineGame(
  { key: 'mahjong-solitaire', engine: 'DOM', aspectRatio: 1.1, maxScore: 41 * 20 + 1000 + 1800 + 300, controls: [{ action: 'Match', keys: 'Click two identical free tiles' }] },
  (host) => new MahjongSolitaire(host),
);
