import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { formatTime, shuffle } from '../../kit/util';

const SYMBOLS = ['★', '◆', '●', '▲', '♣', '♠', '♥', '♦', '☀', '☂', '☃', '✿', '♫', '☯', '⚑', '✈', '⚓', '❄', '☘', '⚡'];
const COLORS = ['#f472b6', '#22d3ee', '#a78bfa', '#4ade80', '#facc15', '#fb923c', '#60a5fa', '#f87171'];
const SIZES = {
  easy: { cols: 4, pairs: 8, base: 800 },
  medium: { cols: 6, pairs: 12, base: 1600 },
  hard: { cols: 6, pairs: 18, base: 3000 },
} as const;
type Size = keyof typeof SIZES;

interface Tile {
  symbol: number;
  matched: boolean;
}

class MemoryMatch extends DomGame {
  private size: Size = 'easy';
  private tiles: Tile[] = [];
  private open: number[] = [];
  private flips = 0;
  private busy = false;
  private shownSecond = -1;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    const { pairs } = SIZES[this.size];
    const symbols = shuffle(this.random, [...SYMBOLS.keys()]).slice(0, pairs);
    this.tiles = shuffle(this.random, [...symbols, ...symbols]).map((symbol) => ({ symbol, matched: false }));
    this.open = [];
    this.flips = 0;
    this.busy = false;
  }

  protected override onTick() {
    const s = Math.floor(this.elapsed);
    if (s !== this.shownSecond && this.flips > 0) {
      this.shownSecond = s;
      this.render();
    }
  }

  private flip(i: number) {
    const tile = this.tiles[i]!;
    if (this.busy || tile.matched || this.open.includes(i)) return;
    this.open.push(i);
    this.flips++;
    this.sfx.click();
    if (this.open.length === 2) {
      const [a, b] = this.open as [number, number];
      if (this.tiles[a]!.symbol === this.tiles[b]!.symbol) {
        this.tiles[a]!.matched = this.tiles[b]!.matched = true;
        this.open = [];
        this.addScore(100);
        this.sfx.good();
        if (this.tiles.every((t) => t.matched)) {
          const { pairs, base } = SIZES[this.size];
          const extraFlips = Math.max(0, this.flips - pairs * 2);
          this.setScore(this.score + Math.max(0, base - extraFlips * 15) + Math.max(0, 300 - Math.floor(this.elapsed)) * 2);
          this.sfx.win();
          this.end('won', { flips: this.flips, seconds: Math.floor(this.elapsed) });
          return;
        }
      } else {
        this.busy = true;
        this.schedule(800, () => {
          this.open = [];
          this.busy = false;
          this.render();
        });
      }
    }
    this.render();
  }

  protected override onAction(action: string, value: string) {
    if (action === 'size' && this.flips === 0) {
      this.size = value as Size;
      this.reset();
      this.render();
    } else if (action === 'tile') this.flip(Number(value));
  }

  protected view() {
    const { cols } = SIZES[this.size];
    const tiles = this.tiles
      .map((t, i) => {
        const up = t.matched || this.open.includes(i) || this.finished;
        const color = COLORS[t.symbol % COLORS.length];
        const style = up
          ? `background:${t.matched ? '#0f2a24' : '#1e2a66'};color:${color};font-size:clamp(18px,5vmin,34px);${t.matched ? 'opacity:.7' : ''}`
          : 'background:linear-gradient(135deg,#6d4aff,#22d3ee);';
        return `<button type="button" class="pv-cell" style="${style}" data-action="tile" data-value="${i}" aria-label="${up ? `Card ${SYMBOLS[t.symbol]}` : 'Hidden card'}" ${t.matched ? 'disabled' : ''}>${up ? SYMBOLS[t.symbol] : ''}</button>`;
      })
      .join('');
    const sizes = (Object.keys(SIZES) as Size[])
      .map((k) => `<button type="button" class="pv-btn small${k === this.size ? ' primary' : ''}" data-action="size" data-value="${k}" ${this.flips ? 'disabled' : ''}>${k[0]!.toUpperCase() + k.slice(1)} (${SIZES[k].pairs} pairs)</button>`)
      .join('');
    const matched = this.tiles.filter((t) => t.matched).length / 2;
    return `
      <div class="pv-row">${sizes}</div>
      <div class="pv-hud"><span>Pairs <b>${matched}/${SIZES[this.size].pairs}</b></span><span>Flips <b>${this.flips}</b></span><span>Time <b>${formatTime(this.elapsed)}</b></span></div>
      <div class="pv-grid" style="--cols:${cols};--gap:8px;--w:${cols * 82}px">${tiles}</div>`;
  }
}

export default defineGame(
  { key: 'memory-match', engine: 'DOM', aspectRatio: 1, maxScore: 10_000, controls: [{ action: 'Flip', keys: 'Click / tap / Enter' }] },
  (host) => new MemoryMatch(host),
);
