import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';

const N = 5;

export function press(board: boolean[], i: number): boolean[] {
  const next = [...board];
  const r = Math.floor(i / N);
  const c = i % N;
  for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const rr = r + dr;
    const cc = c + dc;
    if (rr >= 0 && cc >= 0 && rr < N && cc < N) next[rr * N + cc] = !next[rr * N + cc];
  }
  return next;
}

/** Scrambles by pressing random cells from the all-off state, so every puzzle is solvable. */
export function scramble(random: () => number, presses: number): { board: boolean[]; optimal: number } {
  const chosen = new Set<number>();
  while (chosen.size < presses) chosen.add(Math.floor(random() * N * N));
  let board = Array(N * N).fill(false);
  for (const i of chosen) board = press(board, i);
  return { board, optimal: chosen.size };
}

class LightToggle extends DomGame {
  private board: boolean[] = [];
  private presses = 0;
  private level = 1;
  private optimal = 0;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.level = 1;
    this.load();
  }

  private load() {
    let s = scramble(this.random, 2 + this.level * 2);
    while (s.board.every((v) => !v)) s = scramble(this.random, 2 + this.level * 2);
    this.board = s.board;
    this.optimal = s.optimal;
    this.presses = 0;
  }

  protected override onAction(action: string, value: string) {
    if (action !== 'light') return;
    this.board = press(this.board, Number(value));
    this.presses++;
    this.sfx.click();
    if (this.board.every((v) => !v)) {
      this.addScore(200 * this.level + Math.max(0, this.optimal * 3 - this.presses) * 10);
      this.sfx.win();
      if (this.level >= 6) {
        this.end('won', { levels: 6 });
        return;
      }
      this.level++;
      this.load();
    }
    this.render();
  }

  protected view() {
    const cells = this.board
      .map((on, i) => `<button type="button" class="pv-cell" style="background:${on ? 'radial-gradient(circle,#fef08a,#f59e0b)' : '#11183a'};${on ? 'box-shadow:0 0 18px #f59e0b' : ''}" data-action="light" data-value="${i}" aria-label="Light ${i + 1}: ${on ? 'on' : 'off'}" aria-pressed="${on}"></button>`)
      .join('');
    return `
      <div class="pv-hud"><span>Puzzle <b>${this.level}/6</b></span><span>Presses <b>${this.presses}</b></span><span>Score <b>${this.score}</b></span></div>
      <p class="pv-msg">Turn every light off. Each press toggles the light and its four neighbours.</p>
      <div class="pv-grid" style="--cols:${N};--gap:8px;--w:380px">${cells}</div>`;
  }
}

export default defineGame(
  { key: 'light-toggle', engine: 'DOM', aspectRatio: 0.9, maxScore: 200 * 21 + 6 * 420, controls: [{ action: 'Toggle', keys: 'Click a light' }] },
  (host) => new LightToggle(host),
);
