import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';

// Bitmask connections: 1 = N, 2 = E, 4 = S, 8 = W
const OPP: Record<number, number> = { 1: 4, 2: 8, 4: 1, 8: 2 };
const rotate = (mask: number) => ((mask << 1) | (mask >> 3)) & 15;

/** Random spanning tree over the grid → each cell's pipe mask. Always solvable. */
export function generatePipes(n: number, random: () => number): number[] {
  const masks = Array(n * n).fill(0);
  const seen = new Set([0]);
  const frontier: [number, number, number][] = [];
  const addEdges = (i: number) => {
    const r = Math.floor(i / n);
    const c = i % n;
    if (r > 0) frontier.push([i, i - n, 1]);
    if (c < n - 1) frontier.push([i, i + 1, 2]);
    if (r < n - 1) frontier.push([i, i + n, 4]);
    if (c > 0) frontier.push([i, i - 1, 8]);
  };
  addEdges(0);
  while (frontier.length) {
    const [from, to, dir] = frontier.splice(Math.floor(random() * frontier.length), 1)[0]!;
    if (seen.has(to)) continue;
    seen.add(to);
    masks[from] |= dir;
    masks[to] |= OPP[dir]!;
    addEdges(to);
  }
  return masks;
}

/** Solved when every connection is reciprocated and the whole grid is one network. */
export function isConnected(masks: number[], n: number): boolean {
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n);
    const c = i % n;
    for (const [bit, nr, nc] of [[1, r - 1, c], [2, r, c + 1], [4, r + 1, c], [8, r, c - 1]] as const) {
      const has = (masks[i]! & bit) !== 0;
      const inside = nr >= 0 && nc >= 0 && nr < n && nc < n;
      if (has && (!inside || (masks[nr * n + nc]! & OPP[bit]!) === 0)) return false;
    }
  }
  const seen = new Set([0]);
  const stack = [0];
  while (stack.length) {
    const i = stack.pop()!;
    const r = Math.floor(i / n);
    const c = i % n;
    for (const [bit, j] of [[1, i - n], [2, i + 1], [4, i + n], [8, i - 1]] as const) {
      if ((masks[i]! & bit) && !seen.has(j) && ((bit === 2 && c < n - 1) || (bit === 8 && c > 0) || (bit === 1 && r > 0) || (bit === 4 && r < n - 1))) {
        seen.add(j);
        stack.push(j);
      }
    }
  }
  return seen.size === n * n;
}

class PipeConnect extends DomGame {
  private n = 5;
  private level = 1;
  private masks: number[] = [];
  private rotations = 0;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.level = 1;
    this.load();
  }

  private load() {
    this.n = Math.min(8, 3 + this.level);
    const solved = generatePipes(this.n, this.random);
    do this.masks = solved.map((m) => {
      let r = m;
      for (let k = Math.floor(this.random() * 4); k > 0; k--) r = rotate(r);
      return r;
    });
    while (isConnected(this.masks, this.n));
    this.rotations = 0;
  }

  protected override onAction(action: string, value: string) {
    if (action !== 'cell') return;
    const i = Number(value);
    this.masks[i] = rotate(this.masks[i]!);
    this.rotations++;
    this.sfx.click();
    if (isConnected(this.masks, this.n)) {
      this.addScore(150 * this.level + Math.max(0, this.n * this.n * 2 - this.rotations) * 5);
      this.sfx.win();
      if (this.level >= 5) {
        this.end('won', { levels: 5 });
        return;
      }
      this.level++;
      this.load();
    }
    this.render();
  }

  private pipeSvg(mask: number) {
    const arm = (x2: number, y2: number) => `<line x1="50" y1="50" x2="${x2}" y2="${y2}" stroke="#22d3ee" stroke-width="18" stroke-linecap="round"/>`;
    const arms = [(mask & 1) && arm(50, 0), (mask & 2) && arm(100, 50), (mask & 4) && arm(50, 100), (mask & 8) && arm(0, 50)].filter(Boolean).join('');
    const end = [1, 2, 4, 8].filter((b) => mask & b).length === 1 ? '<circle cx="50" cy="50" r="16" fill="#a78bfa"/>' : '';
    return `<svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">${arms}${end}</svg>`;
  }

  protected view() {
    const cells = this.masks.map((m, i) => `<button type="button" class="pv-cell" style="border-radius:4px;padding:0" data-action="cell" data-value="${i}" aria-label="Pipe tile ${i + 1} — rotate">${this.pipeSvg(m)}</button>`).join('');
    return `
      <div class="pv-hud"><span>Level <b>${this.level}/5</b></span><span>Rotations <b>${this.rotations}</b></span><span>Score <b>${this.score}</b></span></div>
      <p class="pv-msg">Rotate tiles until every pipe connects into one leak-free network.</p>
      <div class="pv-grid" style="--cols:${this.n};--gap:2px;--w:${Math.min(460, this.n * 70)}px">${cells}</div>`;
  }
}

export default defineGame(
  { key: 'pipe-connect', engine: 'DOM', aspectRatio: 0.9, maxScore: 150 * 15 + 5 * 128 * 5, controls: [{ action: 'Rotate', keys: 'Click a tile' }] },
  (host) => new PipeConnect(host),
);
