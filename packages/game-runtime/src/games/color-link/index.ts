import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { adjacent, makeFlows } from './logic';

const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316', '#06b6d4', '#ec4899', '#84cc16'];

class ColorLink extends DomGame {
  private n = 5;
  private level = 1;
  private ends: [number, number][] = [];
  private paths: number[][] = [];
  private active = -1;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.level = 1;
    this.load();
  }

  private load() {
    this.n = Math.min(8, 4 + this.level);
    const flows = makeFlows(this.n, this.n - 1 + Math.floor(this.level / 2), this.random);
    this.ends = flows.map((f) => [f[0]!, f[f.length - 1]!]);
    this.paths = flows.map(() => []);
    this.active = -1;
  }

  private ownerOf(i: number) {
    return this.paths.findIndex((p) => p.includes(i));
  }

  private endOf(i: number) {
    return this.ends.findIndex(([a, b]) => a === i || b === i);
  }

  private complete(k: number) {
    const p = this.paths[k]!;
    const [a, b] = this.ends[k]!;
    return p.length >= 2 && ((p[0] === a && p.at(-1) === b) || (p[0] === b && p.at(-1) === a));
  }

  private click(i: number) {
    const endColor = this.endOf(i);
    if (endColor >= 0) {
      // Start (or restart) a path from an endpoint, or finish the active one.
      if (this.active === endColor && this.paths[endColor]!.length && adjacent(this.paths[endColor]!.at(-1)!, i, this.n) && this.paths[endColor]![0] !== i) {
        this.paths[endColor]!.push(i);
        this.active = -1;
        this.sfx.good();
      } else {
        this.paths[endColor] = [i];
        this.active = endColor;
      }
    } else if (this.active >= 0) {
      const path = this.paths[this.active]!;
      const at = path.indexOf(i);
      if (at >= 0) path.splice(at + 1);
      else if (adjacent(path.at(-1)!, i, this.n) && !this.complete(this.active)) {
        const other = this.ownerOf(i);
        if (other >= 0) this.paths[other]!.splice(this.paths[other]!.indexOf(i)); // cut the crossing path
        path.push(i);
        this.sfx.click();
      }
    } else {
      const owner = this.ownerOf(i);
      if (owner >= 0) {
        this.active = owner;
        this.paths[owner]!.splice(this.paths[owner]!.indexOf(i) + 1);
      }
    }
    const filled = new Set(this.paths.flat()).size === this.n * this.n;
    if (this.paths.every((_, k) => this.complete(k)) && filled) {
      this.addScore(300 * this.level + Math.max(0, 120 - Math.floor(this.elapsed)) * 2);
      this.sfx.win();
      if (this.level >= 5) {
        this.end('won', { levels: 5 });
        return;
      }
      this.level++;
      this.load();
    }
  }

  protected override onAction(action: string, value: string) {
    if (action === 'cell') this.click(Number(value));
    if (!this.finished) this.render();
  }

  protected view() {
    const n = this.n;
    const cells = Array.from({ length: n * n }, (_, i) => {
      const owner = this.ownerOf(i);
      const end = this.endOf(i);
      const color = owner >= 0 ? COLORS[owner % COLORS.length] : end >= 0 ? COLORS[end % COLORS.length] : '';
      const inner = end >= 0 ? `<span style="width:64%;height:64%;border-radius:50%;background:${COLORS[end % COLORS.length]};${this.active === end ? 'box-shadow:0 0 0 3px #fff' : ''}"></span>` : owner >= 0 ? `<span style="width:38%;height:38%;border-radius:4px;background:${color}"></span>` : '';
      return `<button type="button" class="pv-cell" style="border-radius:4px;background:${owner >= 0 ? `${color}33` : '#0e1430'}" data-action="cell" data-value="${i}" aria-label="Cell ${i + 1}${end >= 0 ? ', endpoint' : ''}">${inner}</button>`;
    }).join('');
    const done = this.paths.filter((_, k) => this.complete(k)).length;
    return `
      <div class="pv-hud"><span>Level <b>${this.level}/5</b></span><span>Links <b>${done}/${this.ends.length}</b></span><span>Score <b>${this.score}</b></span></div>
      <p class="pv-msg">Click a dot, then click adjacent cells to draw to its partner. Fill every cell — paths can't cross.</p>
      <div class="pv-grid" style="--cols:${n};--gap:3px;--w:${Math.min(460, n * 70)}px">${cells}</div>`;
  }
}

export default defineGame(
  { key: 'color-link', engine: 'DOM', aspectRatio: 0.9, maxScore: 300 * 15 + 240 * 5, controls: [{ action: 'Draw path', keys: 'Click a dot, then neighbouring cells' }] },
  (host) => new ColorLink(host),
);
