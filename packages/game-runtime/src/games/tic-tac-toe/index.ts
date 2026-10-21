import type { GameHost } from '../../interfaces/game-module';
import { bestMove, type TurnGame } from '../../kit/ai';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { opponentBar, versusScore, type Opponent } from '../../kit/versus';

export const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export interface TState {
  board: number[]; // 0 empty, 1 X, 2 O
  turn: 1 | 2;
}

export function winnerOf(board: number[]): { player: number; line: number[] } | null {
  for (const line of LINES) {
    const [a, b, c] = line as [number, number, number];
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return { player: board[a]!, line };
  }
  return null;
}

export const TTT: TurnGame<TState, number> = {
  moves: (s) => (winnerOf(s.board) ? [] : s.board.flatMap((v, i) => (v ? [] : [i]))),
  play: (s, m) => {
    const board = [...s.board];
    board[m] = s.turn;
    return { board, turn: s.turn === 1 ? 2 : 1 };
  },
  isOver: (s) => !!winnerOf(s.board) || s.board.every(Boolean),
  evaluate: (s) => {
    const w = winnerOf(s.board);
    if (!w) return 0;
    // Prefer faster wins / slower losses.
    const empties = s.board.filter((v) => !v).length;
    return (w.player === s.turn ? 1 : -1) * (10 + empties);
  },
};

const DEPTH: Record<Exclude<Opponent, '2p'>, { depth: number; blunder: number }> = {
  easy: { depth: 2, blunder: 0.5 },
  medium: { depth: 9, blunder: 0.2 },
  hard: { depth: 9, blunder: 0 },
};

class TicTacToe extends DomGame {
  private opponent: Opponent = 'medium';
  private state: TState = { board: Array(9).fill(0), turn: 1 };
  private message = '';

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.state = { board: Array(9).fill(0), turn: 1 };
    this.message = this.opponent === '2p' ? 'X to move' : 'You are X — your move';
  }

  private get started() {
    return this.state.board.some(Boolean);
  }

  private place(i: number) {
    if (this.state.board[i] || TTT.isOver(this.state)) return;
    this.state = TTT.play(this.state, i);
    this.sfx.click();
    if (this.checkEnd()) return;
    if (this.opponent !== '2p' && this.state.turn === 2) {
      this.message = 'Computer is thinking…';
      this.schedule(350, () => this.computerMove());
    } else {
      this.message = `${this.state.turn === 1 ? 'X' : 'O'} to move`;
    }
    this.render();
  }

  private computerMove() {
    if (this.opponent === '2p') return;
    const { depth, blunder } = DEPTH[this.opponent];
    const move = bestMove(TTT, this.state, depth, this.random, blunder);
    if (move === null) return;
    this.state = TTT.play(this.state, move);
    this.sfx.click();
    if (!this.checkEnd()) {
      this.message = 'Your move';
      this.render();
    }
  }

  private checkEnd(): boolean {
    const w = winnerOf(this.state.board);
    const full = this.state.board.every(Boolean);
    if (!w && !full) return false;
    if (this.opponent === '2p') {
      this.message = w ? `${w.player === 1 ? 'X' : 'O'} wins!` : "It's a draw.";
      this.end('completed');
      return true;
    }
    const result = w ? (w.player === 1 ? 'won' : 'lost') : 'draw';
    this.message = result === 'won' ? 'You win! 🎉' : result === 'lost' ? 'The computer wins.' : "It's a draw.";
    this.setScore(versusScore(this.opponent, result));
    if (result === 'won') this.sfx.win();
    this.end(result === 'won' ? 'won' : result === 'lost' ? 'lost' : 'completed');
    return true;
  }

  protected override onAction(action: string, value: string) {
    if (action === 'opponent' && !this.started) {
      this.opponent = value as Opponent;
      this.reset();
      this.render();
    } else if (action === 'cell') {
      if (this.opponent !== '2p' && this.state.turn === 2) return;
      this.place(Number(value));
    }
  }

  protected override onKey(e: KeyboardEvent) {
    if (/^[1-9]$/.test(e.key)) {
      if (this.opponent !== '2p' && this.state.turn === 2) return true;
      this.place(Number(e.key) - 1);
      return true;
    }
    return false;
  }

  protected view() {
    const win = winnerOf(this.state.board);
    const cells = this.state.board
      .map((v, i) => {
        const mark = v === 1 ? '<span style="color:#22d3ee">✕</span>' : v === 2 ? '<span style="color:#f472b6">◯</span>' : '';
        const hl = win?.line.includes(i) ? 'background:#2a2f6e;' : '';
        return `<button type="button" class="pv-cell" style="font-size:clamp(32px,10vmin,72px);${hl}" data-action="cell" data-value="${i}" aria-label="Square ${i + 1}${v ? (v === 1 ? ': X' : ': O') : ''}" ${v ? 'disabled' : ''}>${mark}</button>`;
      })
      .join('');
    return `
      ${opponentBar(this.opponent, this.started)}
      <p class="pv-msg" role="status">${this.message}</p>
      <div class="pv-grid" style="--cols:3;--gap:10px;--w:360px">${cells}</div>
      <p class="pv-muted">Tip: keys 1–9 map to the squares, left to right, top to bottom.</p>`;
  }
}

export default defineGame(
  {
    key: 'tic-tac-toe',
    engine: 'DOM',
    aspectRatio: 1,
    maxScore: 300,
    controls: [{ action: 'Place mark', keys: 'Click / 1–9' }],
  },
  (host) => new TicTacToe(host),
);
