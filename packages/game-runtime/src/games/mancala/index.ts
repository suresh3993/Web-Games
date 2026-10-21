import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { opponentBar, versusScore, type Opponent } from '../../kit/versus';
import { bestPit, initial, isOver, legal, sow, STORE, type MState } from './logic';

const AI = { easy: { depth: 2, blunder: 0.3 }, medium: { depth: 5, blunder: 0.05 }, hard: { depth: 8, blunder: 0 } } as const;

class Mancala extends DomGame {
  private opponent: Opponent = 'medium';
  private state: MState = initial();
  private moved = false;
  private message = '';
  private thinking = false;
  private lastPit = -1;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.state = initial();
    this.moved = false;
    this.thinking = false;
    this.lastPit = -1;
    this.message = this.opponent === '2p' ? 'Player 1 (bottom) to move' : 'You own the bottom row and the right store';
  }

  private move(pit: number) {
    const before = this.state.turn;
    this.state = sow(this.state, pit);
    this.lastPit = pit;
    this.moved = true;
    this.sfx.beep(380 + pit * 20, 0.05, 'triangle');
    if (isOver(this.state)) return this.gameOver();
    const again = this.state.turn === before;
    if (this.opponent !== '2p' && this.state.turn === 2) {
      this.thinking = true;
      this.message = again ? 'Computer earned another turn…' : 'Computer is thinking…';
      this.render();
      this.schedule(500, () => {
        const ai = AI[this.opponent as Exclude<Opponent, '2p'>];
        this.thinking = false;
        this.move(bestPit(this.state, ai.depth, this.random, ai.blunder));
      });
      return;
    }
    this.message = again ? 'Last seed in your store — go again!' : this.opponent === '2p' ? `Player ${this.state.turn} to move` : 'Your move';
    this.render();
  }

  private gameOver() {
    const a = this.state.pits[STORE[1]]!;
    const b = this.state.pits[STORE[2]]!;
    if (this.opponent === '2p') {
      this.message = a === b ? `Draw ${a}–${b}` : `Player ${a > b ? 1 : 2} wins ${Math.max(a, b)}–${Math.min(a, b)}`;
      this.end('completed');
      return;
    }
    const result = a > b ? 'won' : a < b ? 'lost' : 'draw';
    this.setScore(versusScore(this.opponent, result, result === 'won' ? a - b : 0));
    this.message = result === 'won' ? `You win ${a}–${b}! 🎉` : result === 'lost' ? `The computer wins ${b}–${a}.` : `Draw ${a}–${b}.`;
    if (result === 'won') this.sfx.win();
    this.end(result === 'won' ? 'won' : result === 'lost' ? 'lost' : 'completed');
  }

  protected override onAction(action: string, value: string) {
    if (action === 'opponent' && !this.moved) {
      this.opponent = value as Opponent;
      this.reset();
      this.render();
    } else if (action === 'pit' && !this.thinking) {
      const pit = Number(value);
      if (this.opponent !== '2p' && this.state.turn === 2) return;
      if (legal(this.state).includes(pit)) this.move(pit);
    }
  }

  protected view() {
    const pit = (i: number) => {
      const n = this.state.pits[i]!;
      const playable = !this.thinking && legal(this.state).includes(i) && (this.opponent === '2p' || this.state.turn === 1);
      const seeds = Array.from({ length: Math.min(n, 12) }, () => '<i style="width:9px;height:9px;border-radius:50%;background:#facc15;display:inline-block;margin:1px"></i>').join('');
      return `<button type="button" class="pv-cell" style="border-radius:50%;background:${i === this.lastPit ? '#3b2f8f' : '#24306b'};flex-direction:column;gap:2px;${playable ? 'box-shadow:0 0 0 2px #22d3ee' : ''}" data-action="pit" data-value="${i}" aria-label="Pit with ${n} seeds" ${playable ? '' : 'disabled'}><span style="max-width:80%;line-height:0">${seeds}</span><span style="font-size:14px">${n}</span></button>`;
    };
    const store = (i: number, label: string) =>
      `<div class="pv-panel" style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:64px;font-size:28px;font-weight:800">${this.state.pits[i]}<span class="pv-muted">${label}</span></div>`;
    const top = [12, 11, 10, 9, 8, 7].map(pit).join('');
    const bottom = [0, 1, 2, 3, 4, 5].map(pit).join('');
    return `
      ${opponentBar(this.opponent, this.moved)}
      <p class="pv-msg" role="status">${this.message}</p>
      <div class="pv-row" style="flex-wrap:nowrap;width:min(100%,640px)">
        ${store(13, this.opponent === '2p' ? 'P2' : 'CPU')}
        <div style="flex:1;display:grid;grid-template-columns:repeat(6,1fr);gap:8px">${top}${bottom}</div>
        ${store(6, this.opponent === '2p' ? 'P1' : 'You')}
      </div>
      <p class="pv-muted">Seeds sow counter-clockwise. Land in your store to go again; land in an empty pit on your side to capture the opposite pit.</p>`;
  }
}

export default defineGame(
  { key: 'mancala', engine: 'DOM', aspectRatio: 1.5, maxScore: 300 + 3 * 48, controls: [{ action: 'Sow', keys: 'Click one of your pits' }] },
  (host) => new Mancala(host),
);
