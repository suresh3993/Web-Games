import type { GameHost } from '../../interfaces/game-module';
import { bestMove } from '../../kit/ai';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { opponentBar, versusScore, type Opponent } from '../../kit/versus';
import { count, initial, isOver, play, REVERSI, validMoves, type RvState } from './logic';

const AI = { easy: { depth: 1, blunder: 0.3 }, medium: { depth: 3, blunder: 0.05 }, hard: { depth: 5, blunder: 0 } } as const;

class Reversi extends DomGame {
  private opponent: Opponent = 'medium';
  private state: RvState = initial();
  private moved = false;
  private message = '';
  private thinking = false;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.state = initial();
    this.moved = false;
    this.thinking = false;
    this.message = this.opponent === '2p' ? 'Dark to move' : 'You play Dark';
  }

  private advance(move: number) {
    this.state = play(this.state, move);
    this.moved = true;
    if (move >= 0) this.sfx.beep(480, 0.04, 'triangle');
    if (isOver(this.state)) return this.gameOver();
    // Automatic pass when the side to move has no legal move.
    if (!validMoves(this.state).length) {
      const who = this.state.turn === 1 ? 'Dark' : 'Light';
      this.state = play(this.state, -1);
      this.message = `${who} has no moves and passes.`;
    }
    if (this.opponent !== '2p' && this.state.turn === 2) {
      this.thinking = true;
      this.render();
      this.schedule(350, () => {
        const ai = AI[this.opponent as Exclude<Opponent, '2p'>];
        const m = bestMove(REVERSI, this.state, ai.depth, this.random, ai.blunder);
        this.thinking = false;
        this.advance(m ?? -1);
      });
      return;
    }
    if (!this.message.includes('passes')) this.message = this.opponent === '2p' ? `${this.state.turn === 1 ? 'Dark' : 'Light'} to move` : 'Your move';
    this.render();
    this.message = '';
  }

  private gameOver() {
    const dark = count(this.state, 1);
    const light = count(this.state, 2);
    if (this.opponent === '2p') {
      this.message = dark === light ? `Draw ${dark}–${light}` : `${dark > light ? 'Dark' : 'Light'} wins ${Math.max(dark, light)}–${Math.min(dark, light)}`;
      this.end('completed');
      return;
    }
    const result = dark > light ? 'won' : dark < light ? 'lost' : 'draw';
    this.setScore(versusScore(this.opponent, result, result === 'won' ? dark - light : 0));
    this.message = result === 'won' ? `You win ${dark}–${light}! 🎉` : result === 'lost' ? `The computer wins ${light}–${dark}.` : `Draw ${dark}–${light}.`;
    if (result === 'won') this.sfx.win();
    this.end(result === 'won' ? 'won' : result === 'lost' ? 'lost' : 'completed');
  }

  protected override onAction(action: string, value: string) {
    if (action === 'opponent' && !this.moved) {
      this.opponent = value as Opponent;
      this.reset();
      this.render();
      return;
    }
    if (action !== 'sq' || this.thinking || (this.opponent !== '2p' && this.state.turn === 2)) return;
    const i = Number(value);
    if (validMoves(this.state).includes(i)) this.advance(i);
  }

  protected view() {
    const legal = new Set(this.thinking || (this.opponent !== '2p' && this.state.turn === 2) ? [] : validMoves(this.state));
    const cells = this.state.board
      .map((v, i) => {
        const disc = v
          ? `<span style="width:80%;height:80%;border-radius:50%;background:${v === 1 ? '#111827' : '#f8fafc'};box-shadow:0 2px 0 rgba(0,0,0,.4)"></span>`
          : legal.has(i)
            ? '<span style="width:24%;height:24%;border-radius:50%;background:rgba(255,255,255,.35)"></span>'
            : '';
        return `<button type="button" class="pv-cell" style="border-radius:0;background:#15803d;border:1px solid #14532d" data-action="sq" data-value="${i}" aria-label="Square ${i + 1}${v ? (v === 1 ? ': dark' : ': light') : legal.has(i) ? ': legal move' : ''}">${disc}</button>`;
      })
      .join('');
    return `
      ${opponentBar(this.opponent, this.moved)}
      <div class="pv-hud"><span>Dark <b>${count(this.state, 1)}</b></span><span>Light <b>${count(this.state, 2)}</b></span></div>
      <p class="pv-msg" role="status">${this.thinking ? 'Computer is thinking…' : this.message || (this.state.turn === 1 ? 'Dark to move' : 'Light to move')}</p>
      <div class="pv-grid" style="--cols:8;--gap:0px;--w:480px;border:6px solid #14532d;border-radius:8px;overflow:hidden">${cells}</div>`;
  }
}

export default defineGame(
  { key: 'reversi', engine: 'DOM', aspectRatio: 0.9, maxScore: 300 + 3 * 64, controls: [{ action: 'Place disc', keys: 'Click a dotted square' }] },
  (host) => new Reversi(host),
);
