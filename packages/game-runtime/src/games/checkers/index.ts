import type { GameHost } from '../../interfaces/game-module';
import { bestMove } from '../../kit/ai';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { opponentBar, versusScore, type Opponent } from '../../kit/versus';
import { apply, CHECKERS, initial, isKing, legalMoves, owner, winner, type CkMove, type CkState } from './logic';

const AI = { easy: { depth: 2, blunder: 0.25 }, medium: { depth: 4, blunder: 0.05 }, hard: { depth: 6, blunder: 0 } } as const;
const COLORS = ['', '#f43f5e', '#e5e7eb'];

class Checkers extends DomGame {
  private opponent: Opponent = 'medium';
  private state: CkState = initial();
  private selected = -1;
  private options: CkMove[] = [];
  private moved = false;
  private message = '';
  private thinking = false;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.state = initial();
    this.selected = -1;
    this.options = [];
    this.moved = false;
    this.thinking = false;
    this.message = this.opponent === '2p' ? 'Red to move' : 'You are Red — captures are mandatory';
  }

  private play(m: CkMove) {
    this.state = apply(this.state, m);
    this.moved = true;
    this.selected = -1;
    this.options = [];
    this.sfx.beep(m.captures.length ? 300 : 460, 0.05, 'triangle');
    const w = winner(this.state);
    if (w !== null) return this.gameOver(w);
    if (this.opponent !== '2p' && this.state.turn === 2) {
      this.thinking = true;
      this.message = 'Computer is thinking…';
      this.render();
      this.schedule(300, () => {
        const ai = AI[this.opponent as Exclude<Opponent, '2p'>];
        const move = bestMove(CHECKERS, this.state, ai.depth, this.random, ai.blunder);
        this.thinking = false;
        if (move) this.play(move);
      });
      return;
    }
    this.message = this.opponent === '2p' ? `${this.state.turn === 1 ? 'Red' : 'White'} to move` : 'Your move';
    this.render();
  }

  private gameOver(w: 1 | 2 | 0 | 'draw') {
    if (this.opponent === '2p') {
      this.message = w === 'draw' ? 'Draw (40 moves without a capture).' : `${w === 1 ? 'Red' : 'White'} wins!`;
      this.end('completed');
      return;
    }
    const result = w === 'draw' ? 'draw' : w === 1 ? 'won' : 'lost';
    const remaining = this.state.board.filter((v) => owner(v) === 1).length;
    this.setScore(versusScore(this.opponent, result, result === 'won' ? remaining * 5 : 0));
    this.message = result === 'won' ? 'You win! 🎉' : result === 'lost' ? 'The computer wins.' : 'Draw.';
    if (result === 'won') this.sfx.win();
    this.end(result === 'won' ? 'won' : result === 'lost' ? 'lost' : 'completed');
  }

  private click(i: number) {
    if (this.thinking || (this.opponent !== '2p' && this.state.turn === 2)) return;
    const target = this.options.find((m) => m.path[m.path.length - 1] === i);
    if (target) return this.play(target);
    const all = legalMoves(this.state);
    const mine = all.filter((m) => m.path[0] === i);
    if (owner(this.state.board[i]!) === this.state.turn) {
      this.selected = i;
      this.options = mine;
      this.message = mine.length ? (mine[0]!.captures.length ? 'Capture available — you must jump!' : 'Choose a destination') : all[0]?.captures.length ? 'You must capture with another piece.' : 'That piece cannot move.';
    } else {
      this.selected = -1;
      this.options = [];
    }
    this.render();
  }

  protected override onAction(action: string, value: string) {
    if (action === 'opponent' && !this.moved) {
      this.opponent = value as Opponent;
      this.reset();
      this.render();
    } else if (action === 'sq') this.click(Number(value));
  }

  protected view() {
    const dests = new Set(this.options.map((m) => m.path[m.path.length - 1]));
    const cells = this.state.board
      .map((v, i) => {
        const dark = (Math.floor(i / 8) + (i % 8)) % 2 === 1;
        if (!dark) return '<div class="pv-cell" style="border-radius:0;border:0;background:#c7cbe0"></div>';
        const bg = i === this.selected ? '#0e7490' : dests.has(i) ? '#166534' : '#24306b';
        const piece = v
          ? `<span style="width:76%;height:76%;border-radius:50%;background:${COLORS[owner(v)]};box-shadow:inset 0 -4px 0 rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;color:${owner(v) === 1 ? '#fff' : '#1f2937'};font-size:clamp(12px,3vmin,22px)">${isKing(v) ? '♛' : ''}</span>`
          : '';
        return `<button type="button" class="pv-cell" style="border-radius:0;border:0;background:${bg}" data-action="sq" data-value="${i}" aria-label="Square ${i}${v ? `, ${owner(v) === 1 ? 'red' : 'white'}${isKing(v) ? ' king' : ''}` : ''}">${piece}</button>`;
      })
      .join('');
    const counts = [1, 2].map((p) => this.state.board.filter((v) => owner(v) === p).length);
    return `
      ${opponentBar(this.opponent, this.moved)}
      <div class="pv-hud"><span>Red <b>${counts[0]}</b></span><span>White <b>${counts[1]}</b></span></div>
      <p class="pv-msg" role="status">${this.message}</p>
      <div class="pv-grid" style="--cols:8;--gap:0px;--w:500px;border:6px solid #1b2350;border-radius:8px;overflow:hidden">${cells}</div>`;
  }
}

export default defineGame(
  { key: 'checkers', engine: 'DOM', aspectRatio: 0.9, maxScore: 300 + 3 * 60, controls: [{ action: 'Move', keys: 'Click a piece, then a highlighted square' }] },
  (host) => new Checkers(host),
);
