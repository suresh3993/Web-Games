import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { formatTime, shuffle } from '../../kit/util';

/** Original scenes built purely from CSS gradients (no image assets). */
const SCENES = [
  {
    name: 'Neon sunset',
    css: 'radial-gradient(circle at 50% 62%,#fde047 0 12%,transparent 12.5%),linear-gradient(180deg,transparent 0 60%,#1e1b4b 60% 62%,transparent 62%),linear-gradient(160deg,transparent 0 62%,#312e81 62% 100%),linear-gradient(200deg,transparent 0 66%,#4c1d95 66% 100%),linear-gradient(180deg,#f472b6 0%,#fb923c 45%,#7c3aed 100%)',
  },
  {
    name: 'Ocean night',
    css: 'radial-gradient(circle at 75% 22%,#f8fafc 0 6%,transparent 6.5%),radial-gradient(circle at 20% 15%,#fff 0 .6%,transparent .8%),radial-gradient(circle at 45% 30%,#fff 0 .5%,transparent .7%),repeating-linear-gradient(170deg,transparent 0 6%,rgba(255,255,255,.08) 6% 7%),linear-gradient(180deg,#0b1022 0 55%,#0e7490 55% 100%)',
  },
  {
    name: 'Forest hills',
    css: 'radial-gradient(ellipse at 20% 100%,#14532d 0 40%,transparent 40.5%),radial-gradient(ellipse at 80% 100%,#166534 0 45%,transparent 45.5%),radial-gradient(ellipse at 50% 110%,#15803d 0 55%,transparent 55.5%),radial-gradient(circle at 30% 25%,#fef9c3 0 8%,transparent 8.5%),linear-gradient(180deg,#38bdf8,#bae6fd)',
  },
  {
    name: 'Pixel city',
    css: 'repeating-linear-gradient(90deg,#1e293b 0 9%,#334155 9% 10%,transparent 10% 13%),repeating-linear-gradient(0deg,rgba(250,204,21,.6) 0 1.5%,transparent 1.5% 5%),linear-gradient(180deg,#0f172a 0 30%,transparent 30%),linear-gradient(180deg,#6d28d9,#db2777)',
  },
];
const SIZES = { 3: 600, 4: 1500, 5: 3000 } as const;
type Size = keyof typeof SIZES;

class Jigsaw extends DomGame {
  private n: Size = 3;
  private scene = SCENES[0]!;
  private order: number[] = [];
  private selected = -1;
  private swaps = 0;
  private shownSecond = -1;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.scene = SCENES[Math.floor(this.random() * SCENES.length)]!;
    do this.order = shuffle(this.random, [...Array(this.n * this.n).keys()]);
    while (this.order.every((v, i) => v === i));
    this.selected = -1;
    this.swaps = 0;
  }

  protected override onTick() {
    const s = Math.floor(this.elapsed);
    if (this.swaps && s !== this.shownSecond) {
      this.shownSecond = s;
      this.render();
    }
  }

  protected override onAction(action: string, value: string) {
    if (action === 'size' && !this.swaps) {
      this.n = Number(value) as Size;
      this.reset();
    } else if (action === 'tile') {
      const i = Number(value);
      if (this.selected < 0) this.selected = i;
      else if (this.selected === i) this.selected = -1;
      else {
        [this.order[i], this.order[this.selected]] = [this.order[this.selected]!, this.order[i]!];
        this.selected = -1;
        this.swaps++;
        this.sfx.click();
        if (this.order.every((v, k) => v === k)) {
          this.setScore(SIZES[this.n] + Math.max(0, 600 - Math.floor(this.elapsed)) * 2 + Math.max(0, this.n * this.n * 2 - this.swaps) * 10);
          this.sfx.win();
          this.end('won', { swaps: this.swaps });
          return;
        }
      }
    }
    this.render();
  }

  protected view() {
    const n = this.n;
    const tiles = this.order
      .map((piece, i) => {
        const x = (piece % n) * (100 / (n - 1));
        const y = Math.floor(piece / n) * (100 / (n - 1));
        const correct = piece === i;
        return `<button type="button" class="pv-cell${i === this.selected ? ' sel' : ''}" style="border-radius:2px;border:${correct ? '0' : '1px solid rgba(0,0,0,.4)'};background:${this.scene.css};background-size:${n * 100}% ${n * 100}%;background-position:${x}% ${y}%" data-action="tile" data-value="${i}" aria-label="Piece ${piece + 1} at position ${i + 1}${correct ? ' (correct)' : ''}"></button>`;
      })
      .join('');
    const sizes = ([3, 4, 5] as Size[]).map((s) => `<button type="button" class="pv-btn small${s === n ? ' primary' : ''}" data-action="size" data-value="${s}" ${this.swaps ? 'disabled' : ''}>${s * s} pieces</button>`).join('');
    return `
      <div class="pv-row">${sizes}</div>
      <div class="pv-hud"><span>Scene <b>${this.scene.name}</b></span><span>Swaps <b>${this.swaps}</b></span><span>Time <b>${formatTime(this.elapsed)}</b></span></div>
      <div class="pv-grid" style="--cols:${n};--gap:${this.finished ? 0 : 2}px;--w:440px">${tiles}</div>
      <div style="width:120px;aspect-ratio:1;border-radius:8px;background:${this.scene.css}" aria-label="Preview of the finished picture"></div>
      <p class="pv-muted">Click two pieces to swap them. Rebuild the picture shown in the preview.</p>`;
  }
}

export default defineGame(
  { key: 'jigsaw', engine: 'DOM', aspectRatio: 0.75, maxScore: 3000 + 1200 + 500, controls: [{ action: 'Swap', keys: 'Click two pieces' }] },
  (host) => new Jigsaw(host),
);
