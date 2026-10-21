import type { GameHost } from '../../interfaces/game-module';
import { bestMove } from '../../kit/ai';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { opponentBar, versusScore, type Opponent } from '../../kit/versus';
import { C4, COLS, dropRow, initial, ROWS, winLine, type C4State } from './logic';

const AI: Record<Exclude<Opponent, '2p'>, { depth: number; blunder: number }> = {
  easy: { depth: 2, blunder: 0.3 },
  medium: { depth: 4, blunder: 0.05 },
  hard: { depth: 6, blunder: 0 },
};
const COLORS = ['', '#22d3ee', '#f472b6'];

class FourInARow extends DomGame {
  private opponent: Opponent = 'medium';
  private state: C4State = initial();
  private message = '';
  private cursor = 3;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.state = initial();
    this.cursor = 3;
    this.message = this.opponent === '2p' ? 'Cyan to move' : 'You are cyan — drop a disc';
  }

  private get waiting() {
    return this.opponent !== '2p' && this.state.turn === 2;
  }

  private drop(col: number) {
    if (this.waiting || C4.isOver(this.state) || dropRow(this.state.board, col) < 0) return;
    this.apply(col);
    if (!this.finished && this.opponent !== '2p') {
      this.message = 'Computer is thinking…';
      this.render();
      this.schedule(300, () => {
        const { depth, blunder } = AI[this.opponent as Exclude<Opponent, '2p'>];
        const move = bestMove(C4, this.state, depth, this.random, blunder);
        if (move !== null) this.apply(move);
        if (!this.finished) {
          this.message = 'Your move';
          this.render();
        }
      });
    }
  }

  private apply(col: number) {
    this.state = C4.play(this.state, col);
    this.sfx.click();
    const line = winLine(this.state.board, this.state.last);
    const full = this.state.board.every(Boolean);
    if (!line && !full) {
      if (this.opponent === '2p') this.message = `${this.state.turn === 1 ? 'Cyan' : 'Pink'} to move`;
      this.render();
      return;
    }
    const winner = line ? this.state.board[this.state.last] : 0;
    if (this.opponent === '2p') {
      this.message = winner ? `${winner === 1 ? 'Cyan' : 'Pink'} wins!` : 'Draw — the board is full.';
      this.end('completed');
      return;
    }
    const result = winner === 1 ? 'won' : winner === 2 ? 'lost' : 'draw';
    const movesLeft = this.state.board.filter((v) => !v).length;
    this.setScore(versusScore(this.opponent, result, result === 'won' ? movesLeft : 0));
    this.message = result === 'won' ? 'Four in a row — you win! 🎉' : result === 'lost' ? 'The computer connected four.' : 'Draw — the board is full.';
    if (result === 'won') this.sfx.win();
    this.end(result === 'won' ? 'won' : result === 'lost' ? 'lost' : 'completed');
  }

  protected override onAction(action: string, value: string) {
    if (action === 'opponent' && this.state.last < 0) {
      this.opponent = value as Opponent;
      this.reset();
      this.render();
    } else if (action === 'col') {
      this.cursor = Number(value);
      this.drop(this.cursor);
    }
  }

  protected override onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      this.cursor = Math.max(0, Math.min(COLS - 1, this.cursor + (e.key === 'ArrowLeft' ? -1 : 1)));
      this.render();
      return true;
    }
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      this.drop(this.cursor);
      return true;
    }
    if (/^[1-7]$/.test(e.key)) {
      this.cursor = Number(e.key) - 1;
      this.drop(this.cursor);
      return true;
    }
    return false;
  }

  protected view() {
    const line = new Set(winLine(this.state.board, this.state.last) ?? []);
    const cells: string[] = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        const v = this.state.board[i]!;
        const disc = v
          ? `<span style="width:78%;height:78%;border-radius:50%;background:${COLORS[v]};box-shadow:0 0 ${line.has(i) ? 18 : 6}px ${COLORS[v]};${line.has(i) ? 'outline:3px solid #fff' : ''}"></span>`
          : `<span style="width:78%;height:78%;border-radius:50%;background:#070a17"></span>`;
        cells.push(
          `<button type="button" class="pv-cell" style="border-radius:0;background:#2a3aa8;border:0;${c === this.cursor ? 'background:#3346c4;' : ''}" data-action="col" data-value="${c}" aria-label="Column ${c + 1}, row ${r + 1}${v ? (v === 1 ? ': cyan' : ': pink') : ''}">${disc}</button>`,
        );
      }
    return `
      ${opponentBar(this.opponent, this.state.last >= 0)}
      <p class="pv-msg" role="status">${this.message}</p>
      <div class="pv-grid" style="--cols:${COLS};--gap:0px;--w:460px;border-radius:14px;overflow:hidden;border:6px solid #2a3aa8">${cells.join('')}</div>
      <p class="pv-muted">Click a column, or use ← → and Enter / keys 1–7.</p>`;
  }
}

export default defineGame(
  { key: 'four-in-a-row', engine: 'DOM', aspectRatio: 1.05, maxScore: 300 + 3 * 42, controls: [{ action: 'Drop disc', keys: 'Click column / 1–7 / ← → Enter' }] },
  (host) => new FourInARow(host),
);
