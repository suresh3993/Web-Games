import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { opponentBar, versusScore, type Opponent } from '../../kit/versus';

export const N = 9;
// Player 1 (red) connects top ↔ bottom; player 2 (blue) connects left ↔ right.
const NB = [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0]] as const;

export function hexNeighbours(i: number): number[] {
  const r = Math.floor(i / N);
  const c = i % N;
  return NB.map(([dr, dc]) => [r + dr, c + dc]).filter(([rr, cc]) => rr! >= 0 && cc! >= 0 && rr! < N && cc! < N).map(([rr, cc]) => rr! * N + cc!);
}

/** Cells on the winning chain, or null. */
export function winningChain(board: number[], player: 1 | 2): number[] | null {
  const starts = [...Array(N).keys()].map((k) => (player === 1 ? k : k * N)).filter((i) => board[i] === player);
  const parent = new Map<number, number>();
  const queue = [...starts];
  starts.forEach((s) => parent.set(s, -1));
  while (queue.length) {
    const i = queue.shift()!;
    const r = Math.floor(i / N);
    const c = i % N;
    if ((player === 1 && r === N - 1) || (player === 2 && c === N - 1)) {
      const chain: number[] = [];
      for (let k = i; k !== -1; k = parent.get(k)!) chain.push(k);
      return chain;
    }
    for (const n of hexNeighbours(i)) if (board[n] === player && !parent.has(n)) {
      parent.set(n, i);
      queue.push(n);
    }
  }
  return null;
}

/** 0-1 BFS: empty cells cost 1, own stones 0, opponent stones impassable. */
export function distanceToConnect(board: number[], player: 1 | 2): number {
  const dist = Array(N * N).fill(Infinity);
  const deque: number[] = [];
  for (let k = 0; k < N; k++) {
    const i = player === 1 ? k : k * N;
    if (board[i] && board[i] !== player) continue;
    const cost = board[i] === player ? 0 : 1;
    if (cost < dist[i]) {
      dist[i] = cost;
      if (cost === 0) deque.unshift(i);
      else deque.push(i);
    }
  }
  while (deque.length) {
    const i = deque.shift()!;
    for (const n of hexNeighbours(i)) {
      if (board[n] && board[n] !== player) continue;
      const nd = dist[i] + (board[n] === player ? 0 : 1);
      if (nd < dist[n]) {
        dist[n] = nd;
        if (board[n] === player) deque.unshift(n);
        else deque.push(n);
      }
    }
  }
  let best = Infinity;
  for (let k = 0; k < N; k++) best = Math.min(best, dist[player === 1 ? (N - 1) * N + k : k * N + N - 1]);
  return best;
}

export function aiMove(board: number[], me: 1 | 2, random: () => number, noise: number): number {
  const them = me === 1 ? 2 : 1;
  let best = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < N * N; i++) {
    if (board[i]) continue;
    const next = [...board];
    next[i] = me;
    const v = distanceToConnect(next, them) * 1.1 - distanceToConnect(next, me) + random() * noise;
    if (v > bestScore) {
      bestScore = v;
      best = i;
    }
  }
  return best;
}

const NOISE = { easy: 3, medium: 0.8, hard: 0.05 } as const;

class Hex extends DomGame {
  private opponent: Opponent = 'medium';
  private board: number[] = [];
  private turn: 1 | 2 = 1;
  private chain: number[] = [];
  private placed = 0;
  private thinking = false;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.board = Array(N * N).fill(0);
    this.turn = 1;
    this.chain = [];
    this.placed = 0;
    this.thinking = false;
  }

  private place(i: number) {
    this.board[i] = this.turn;
    this.placed++;
    this.sfx.click();
    const chain = winningChain(this.board, this.turn);
    if (chain) {
      this.chain = chain;
      if (this.opponent === '2p') this.end('completed');
      else {
        const won = this.turn === 1;
        this.setScore(versusScore(this.opponent, won ? 'won' : 'lost', won ? Math.max(0, 45 - this.placed) : 0));
        if (won) this.sfx.win();
        this.end(won ? 'won' : 'lost');
      }
      return;
    }
    this.turn = this.turn === 1 ? 2 : 1;
    if (this.opponent !== '2p' && this.turn === 2) {
      this.thinking = true;
      this.render();
      this.schedule(300, () => {
        this.thinking = false;
        const m = aiMove(this.board, 2, this.random, NOISE[this.opponent as Exclude<Opponent, '2p'>]);
        if (m >= 0) this.place(m);
      });
      return;
    }
    this.render();
  }

  protected override onAction(action: string, value: string) {
    if (action === 'opponent' && this.placed === 0) {
      this.opponent = value as Opponent;
      this.reset();
      this.render();
    } else if (action === 'cell' && !this.thinking && (this.opponent === '2p' || this.turn === 1) && !this.board[Number(value)]) this.place(Number(value));
  }

  protected view() {
    const win = new Set(this.chain);
    const size = `min(${88 / (N * 1.5)}vw, ${560 / (N * 1.5)}px)`;
    const rows = Array.from({ length: N }, (_, r) => {
      const cells = Array.from({ length: N }, (_, c) => {
        const i = r * N + c;
        const v = this.board[i];
        const bg = v === 1 ? '#f43f5e' : v === 2 ? '#3b82f6' : '#1b2350';
        return `<button type="button" data-action="cell" data-value="${i}" aria-label="Cell ${r + 1}-${c + 1}${v ? (v === 1 ? ': red' : ': blue') : ''}" style="all:unset;cursor:pointer;width:${size};aspect-ratio:1;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);background:${bg};${win.has(i) ? 'filter:brightness(1.6)' : ''}"></button>`;
      }).join('');
      return `<div style="display:flex;gap:2px;margin-left:calc(${r} * ${size} / 2)">${cells}</div>`;
    }).join('');
    const status = this.finished
      ? this.opponent === '2p'
        ? `${this.turn === 1 ? 'Red' : 'Blue'} connects and wins!`
        : this.turn === 1
          ? 'You connected top to bottom — you win! 🎉'
          : 'Blue connected left to right.'
      : this.thinking
        ? 'Blue is thinking…'
        : `${this.turn === 1 ? 'Red' : 'Blue'} to move`;
    return `
      ${opponentBar(this.opponent, this.placed > 0)}
      <p class="pv-msg" role="status">${status}</p>
      <p class="pv-muted"><span style="color:#f43f5e">Red</span> joins top ↔ bottom · <span style="color:#3b82f6">Blue</span> joins left ↔ right</p>
      <div style="display:flex;flex-direction:column;gap:1px;padding:8px;border-top:4px solid #f43f5e;border-bottom:4px solid #f43f5e;border-left:4px solid #3b82f6;border-right:4px solid #3b82f6;border-radius:6px">${rows}</div>`;
  }
}

export default defineGame(
  { key: 'hex', engine: 'DOM', aspectRatio: 1.3, maxScore: 300 + 3 * 45, controls: [{ action: 'Claim cell', keys: 'Click a hexagon' }] },
  (host) => new Hex(host),
);
