import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';

const N = 7;
/** English cross: -1 = not part of the board, 1 = peg, 0 = hole. */
export function crossBoard(): number[] {
  return Array.from({ length: N * N }, (_, i) => {
    const r = Math.floor(i / N);
    const c = i % N;
    if ((r < 2 || r > 4) && (c < 2 || c > 4)) return -1;
    return r === 3 && c === 3 ? 0 : 1;
  });
}

export function jumps(board: number[], from: number): { to: number; over: number }[] {
  if (board[from] !== 1) return [];
  const r = Math.floor(from / N);
  const c = from % N;
  return ([[0, 2], [0, -2], [2, 0], [-2, 0]] as const)
    .map(([dr, dc]) => ({ r2: r + dr, c2: c + dc, over: (r + dr / 2) * N + (c + dc / 2) }))
    .filter(({ r2, c2, over }) => r2 >= 0 && c2 >= 0 && r2 < N && c2 < N && board[r2 * N + c2] === 0 && board[over] === 1)
    .map(({ r2, c2, over }) => ({ to: r2 * N + c2, over }));
}

export const anyMoves = (board: number[]) => board.some((v, i) => v === 1 && jumps(board, i).length > 0);

class PegSolitaire extends DomGame {
  private board: number[] = [];
  private selected = -1;
  private history: number[][] = [];

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.board = crossBoard();
    this.selected = -1;
    this.history = [];
  }

  private get pegs() {
    return this.board.filter((v) => v === 1).length;
  }

  private click(i: number) {
    if (this.board[i] === 1) {
      this.selected = this.selected === i ? -1 : i;
      this.render();
      return;
    }
    const move = this.selected >= 0 ? jumps(this.board, this.selected).find((j) => j.to === i) : undefined;
    if (!move) return;
    this.history.push([...this.board]);
    this.board[this.selected] = 0;
    this.board[move.over] = 0;
    this.board[move.to] = 1;
    this.selected = move.to;
    this.sfx.click();
    this.setScore((32 - this.pegs) * 10);
    if (!anyMoves(this.board)) {
      const perfect = this.pegs === 1;
      const centre = perfect && this.board[3 * N + 3] === 1;
      this.addScore(perfect ? (centre ? 1000 : 500) : 0);
      if (perfect) this.sfx.win();
      this.end(perfect ? 'won' : 'completed', { pegsLeft: this.pegs });
      return;
    }
    this.render();
  }

  protected override onAction(action: string, value: string) {
    if (action === 'hole') this.click(Number(value));
    if (action === 'undo' && this.history.length) {
      this.board = this.history.pop()!;
      this.selected = -1;
      this.setScore((32 - this.pegs) * 10);
      this.render();
    }
  }

  protected view() {
    const targets = new Set(this.selected >= 0 ? jumps(this.board, this.selected).map((j) => j.to) : []);
    const cells = this.board
      .map((v, i) => {
        if (v === -1) return '<div></div>';
        const peg = v === 1 ? `<span style="width:62%;height:62%;border-radius:50%;background:radial-gradient(circle at 35% 35%,#c4b5fd,#6d4aff);${i === this.selected ? 'box-shadow:0 0 0 3px #22d3ee' : ''}"></span>` : `<span style="width:34%;height:34%;border-radius:50%;background:${targets.has(i) ? '#4ade80' : '#070a17'}"></span>`;
        return `<button type="button" class="pv-cell" style="border-radius:50%" data-action="hole" data-value="${i}" aria-label="${v === 1 ? 'Peg' : targets.has(i) ? 'Empty hole (valid jump)' : 'Empty hole'}">${peg}</button>`;
      })
      .join('');
    return `
      <div class="pv-hud"><span>Pegs left <b>${this.pegs}</b></span><span>Score <b>${this.score}</b></span></div>
      <p class="pv-msg">Jump a peg over a neighbour into an empty hole. Finish with one peg — in the centre for a bonus.</p>
      <div class="pv-grid" style="--cols:${N};--gap:6px;--w:420px">${cells}</div>
      <button type="button" class="pv-btn small" data-action="undo" data-value="" ${this.history.length ? '' : 'disabled'}>↶ Undo</button>`;
  }
}

export default defineGame(
  { key: 'peg-solitaire', engine: 'DOM', aspectRatio: 0.9, maxScore: 1_310, controls: [{ action: 'Jump', keys: 'Click a peg, then a green hole' }] },
  (host) => new PegSolitaire(host),
);
