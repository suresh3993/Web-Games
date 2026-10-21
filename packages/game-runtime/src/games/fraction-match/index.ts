import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { esc, shuffle } from '../../kit/util';

/** Value groups: every label in a group represents the same number. */
const GROUPS: string[][] = [
  ['1/2', '50%', '0.5', '2/4'], ['1/4', '25%', '0.25', '2/8'], ['3/4', '75%', '0.75', '6/8'], ['1/5', '20%', '0.2', '2/10'],
  ['1/10', '10%', '0.1', '3/30'], ['2/5', '40%', '0.4', '4/10'], ['3/5', '60%', '0.6', '6/10'], ['1/3', '2/6', '3/9', '4/12'],
  ['2/3', '4/6', '6/9', '8/12'], ['1/8', '12.5%', '0.125', '2/16'], ['9/10', '90%', '0.9', '18/20'], ['3/10', '30%', '0.3', '6/20'],
];

interface Tile {
  label: string;
  group: number;
  matched: boolean;
}

class FractionMatch extends DomGame {
  private tiles: Tile[] = [];
  private open: number[] = [];
  private flips = 0;
  private busy = false;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    const groups = shuffle(this.random, [...GROUPS.keys()]).slice(0, 8);
    this.tiles = shuffle(
      this.random,
      groups.flatMap((g) => shuffle(this.random, GROUPS[g]!).slice(0, 2).map((label) => ({ label, group: g, matched: false }))),
    );
    this.open = [];
    this.flips = 0;
    this.busy = false;
  }

  protected override onAction(action: string, value: string) {
    if (action !== 'tile' || this.busy) return;
    const i = Number(value);
    if (this.tiles[i]!.matched || this.open.includes(i)) return;
    this.open.push(i);
    this.flips++;
    this.sfx.click();
    if (this.open.length === 2) {
      const [a, b] = this.open as [number, number];
      if (this.tiles[a]!.group === this.tiles[b]!.group) {
        this.tiles[a]!.matched = this.tiles[b]!.matched = true;
        this.open = [];
        this.addScore(100);
        this.sfx.good();
        if (this.tiles.every((t) => t.matched)) {
          this.addScore(Math.max(0, 800 - Math.max(0, this.flips - 16) * 25) + Math.max(0, 240 - Math.floor(this.elapsed)) * 2);
          this.sfx.win();
          this.end('won', { flips: this.flips });
          return;
        }
      } else {
        this.busy = true;
        this.schedule(900, () => {
          this.open = [];
          this.busy = false;
          this.render();
        });
      }
    }
    this.render();
  }

  protected view() {
    const tiles = this.tiles
      .map((t, i) => {
        const up = t.matched || this.open.includes(i) || this.finished;
        return `<button type="button" class="pv-cell" style="font-size:clamp(14px,3.6vmin,24px);${up ? `background:${t.matched ? '#0f2a24' : '#1e2a66'};color:${t.matched ? '#4ade80' : '#e6e9f5'}` : 'background:linear-gradient(135deg,#84cc16,#0e7490)'}" data-action="tile" data-value="${i}" aria-label="${up ? esc(t.label) : 'Hidden card'}" ${t.matched ? 'disabled' : ''}>${up ? esc(t.label) : '?'}</button>`;
      })
      .join('');
    return `
      <div class="pv-hud"><span>Pairs <b>${this.tiles.filter((t) => t.matched).length / 2}/8</b></span><span>Flips <b>${this.flips}</b></span><span>Score <b>${this.score}</b></span></div>
      <p class="pv-msg">Match cards with the same value — fractions, decimals and percentages.</p>
      <div class="pv-grid" style="--cols:4;--gap:8px;--w:420px">${tiles}</div>`;
  }
}

export default defineGame(
  { key: 'fraction-match', engine: 'DOM', aspectRatio: 0.9, maxScore: 800 + 800 + 480, controls: [{ action: 'Flip', keys: 'Click cards' }] },
  (host) => new FractionMatch(host),
);
