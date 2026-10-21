import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { opponentBar, versusScore, type Opponent } from '../../kit/versus';

const N = 15;
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]] as const;

/** Length of the line through `i` for `player` in each direction (freestyle: 5+ wins). */
export function lineAt(board: number[], i: number, player: number): { length: number; cells: number[] } {
  let best = { length: 0, cells: [] as number[] };
  const r0 = Math.floor(i / N);
  const c0 = i % N;
  for (const [dr, dc] of DIRS) {
    const cells = [i];
    for (const s of [1, -1]) {
      let r = r0 + dr * s;
      let c = c0 + dc * s;
      while (r >= 0 && c >= 0 && r < N && c < N && board[r * N + c] === player) {
        cells.push(r * N + c);
        r += dr * s;
        c += dc * s;
      }
    }
    if (cells.length > best.length) best = { length: cells.length, cells };
  }
  return best;
}

/** Pattern score for placing `player` at empty cell `i` (counts runs and open ends). */
function patternScore(board: number[], i: number, player: number): number {
  let total = 0;
  const r0 = Math.floor(i / N);
  const c0 = i % N;
  for (const [dr, dc] of DIRS) {
    let count = 1;
    let open = 0;
    for (const s of [1, -1]) {
      let r = r0 + dr * s;
      let c = c0 + dc * s;
      while (r >= 0 && c >= 0 && r < N && c < N && board[r * N + c] === player) {
        count++;
        r += dr * s;
        c += dc * s;
      }
      if (r >= 0 && c >= 0 && r < N && c < N && board[r * N + c] === 0) open++;
    }
    if (count >= 5) total += 1_000_000;
    else if (count === 4) total += open === 2 ? 100_000 : open === 1 ? 10_000 : 0;
    else if (count === 3) total += open === 2 ? 5_000 : open === 1 ? 400 : 0;
    else if (count === 2) total += open === 2 ? 200 : open === 1 ? 30 : 0;
    else total += open * 4;
  }
  return total;
}

/** Heuristic move: maximise own attack + weighted defence over cells near stones. */
export function aiMove(board: number[], me: number, random: () => number, defence = 0.9, noise = 0): number {
  const them = me === 1 ? 2 : 1;
  if (board.every((v) => !v)) return Math.floor(N / 2) * N + Math.floor(N / 2);
  let best = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < N * N; i++) {
    if (board[i]) continue;
    const r = Math.floor(i / N);
    const c = i % N;
    let near = false;
    for (let dr = -2; dr <= 2 && !near; dr++)
      for (let dc = -2; dc <= 2 && !near; dc++) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && cc >= 0 && rr < N && cc < N && board[rr * N + cc]) near = true;
      }
    if (!near) continue;
    const score = patternScore(board, i, me) + patternScore(board, i, them) * defence + random() * (1 + noise);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

const AI = { easy: { defence: 0.5, noise: 3000 }, medium: { defence: 0.85, noise: 300 }, hard: { defence: 0.95, noise: 0 } } as const;

class Gomoku extends DomGame {
  private opponent: Opponent = 'medium';
  private board: number[] = [];
  private turn: 1 | 2 = 1;
  private last = -1;
  private winLine: number[] = [];
  private message = '';
  private thinking = false;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.board = Array(N * N).fill(0);
    this.turn = 1;
    this.last = -1;
    this.winLine = [];
    this.thinking = false;
    this.message = this.opponent === '2p' ? 'Black to move' : 'You play Black — make five in a row';
  }

  private place(i: number) {
    this.board[i] = this.turn;
    this.last = i;
    this.sfx.click();
    const line = lineAt(this.board, i, this.turn);
    if (line.length >= 5) {
      this.winLine = line.cells;
      return this.gameOver(this.turn);
    }
    if (this.board.every(Boolean)) return this.gameOver(0);
    this.turn = this.turn === 1 ? 2 : 1;
    if (this.opponent !== '2p' && this.turn === 2) {
      this.thinking = true;
      this.render();
      this.schedule(300, () => {
        const ai = AI[this.opponent as Exclude<Opponent, '2p'>];
        const move = aiMove(this.board, 2, this.random, ai.defence, ai.noise);
        this.thinking = false;
        if (move >= 0) this.place(move);
      });
      return;
    }
    this.message = this.opponent === '2p' ? `${this.turn === 1 ? 'Black' : 'White'} to move` : 'Your move';
    this.render();
  }

  private gameOver(winner: number) {
    if (this.opponent === '2p') {
      this.message = winner ? `${winner === 1 ? 'Black' : 'White'} wins!` : 'Draw.';
      this.end('completed');
      return;
    }
    const result = winner === 1 ? 'won' : winner === 2 ? 'lost' : 'draw';
    const stones = this.board.filter((v) => v === 1).length;
    this.setScore(versusScore(this.opponent, result, result === 'won' ? Math.max(0, 60 - stones) : 0));
    this.message = result === 'won' ? 'Five in a row — you win! 🎉' : result === 'lost' ? 'The computer made five.' : 'Draw.';
    if (result === 'won') this.sfx.win();
    this.end(result === 'won' ? 'won' : result === 'lost' ? 'lost' : 'completed');
  }

  protected override onAction(action: string, value: string) {
    if (action === 'opponent' && this.last < 0) {
      this.opponent = value as Opponent;
      this.reset();
      this.render();
    } else if (action === 'pt' && !this.thinking && (this.opponent === '2p' || this.turn === 1)) {
      const i = Number(value);
      if (!this.board[i]) this.place(i);
    }
  }

  protected view() {
    const win = new Set(this.winLine);
    const cells = this.board
      .map((v, i) => {
        const stone = v
          ? `<span style="width:84%;height:84%;border-radius:50%;background:${v === 1 ? 'radial-gradient(circle at 35% 35%,#4b5563,#030712)' : 'radial-gradient(circle at 35% 35%,#fff,#cbd5e1)'};${win.has(i) ? 'box-shadow:0 0 0 3px #f43f5e' : i === this.last ? 'box-shadow:0 0 0 2px #22d3ee' : ''}"></span>`
          : '';
        return `<button type="button" class="pv-cell" style="border-radius:0;border:0;background:linear-gradient(#8a6a3a,#8a6a3a) center/100% 1px no-repeat,linear-gradient(#8a6a3a,#8a6a3a) center/1px 100% no-repeat,#e2b86b" data-action="pt" data-value="${i}" aria-label="Point ${Math.floor(i / N) + 1}-${(i % N) + 1}${v ? (v === 1 ? ': black' : ': white') : ''}">${stone}</button>`;
      })
      .join('');
    return `
      ${opponentBar(this.opponent, this.last >= 0)}
      <p class="pv-msg" role="status">${this.thinking ? 'Computer is thinking…' : this.message}</p>
      <div class="pv-grid" style="--cols:${N};--gap:0px;--w:560px;padding:6px;background:#e2b86b;border-radius:8px">${cells}</div>`;
  }
}

export default defineGame(
  { key: 'gomoku', engine: 'DOM', aspectRatio: 0.9, maxScore: 300 + 3 * 60, controls: [{ action: 'Place stone', keys: 'Click an intersection' }] },
  (host) => new Gomoku(host),
);
