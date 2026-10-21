import type { GameHost } from '../../interfaces/game-module';
import { bestMove } from '../../kit/ai';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { opponentBar, versusScore, type Opponent } from '../../kit/versus';
import { apply, COORDS, initial, legalMoves, MORRIS, piecesLeft, winner, type MorrisMove, type MorrisState } from './logic';

const AI = { easy: { depth: 1, blunder: 0.3 }, medium: { depth: 2, blunder: 0.05 }, hard: { depth: 3, blunder: 0 } } as const;
const COLORS = ['', '#22d3ee', '#f472b6'];

class NineMensMorris extends DomGame {
  private opponent: Opponent = 'medium';
  private state: MorrisState = initial();
  private from = -1;
  private pendingRemoval: MorrisMove[] | null = null;
  private message = '';
  private thinking = false;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.state = initial();
    this.from = -1;
    this.pendingRemoval = null;
    this.thinking = false;
    this.message = 'Place your pieces. Three in a line (a mill) removes an enemy piece.';
  }

  private commit(m: MorrisMove) {
    this.state = apply(this.state, m);
    this.from = -1;
    this.pendingRemoval = null;
    this.sfx.beep(m.remove >= 0 ? 300 : 460, 0.06, 'triangle');
    const w = winner(this.state);
    if (w) return this.gameOver(w);
    if (this.opponent !== '2p' && this.state.turn === 2) {
      this.thinking = true;
      this.message = m.remove >= 0 ? 'Mill! Computer is thinking…' : 'Computer is thinking…';
      this.render();
      this.schedule(400, () => {
        const ai = AI[this.opponent as Exclude<Opponent, '2p'>];
        const mv = bestMove(MORRIS, this.state, ai.depth, this.random, ai.blunder);
        this.thinking = false;
        if (mv) this.commit(mv);
      });
      return;
    }
    this.message = `${this.opponent === '2p' ? (this.state.turn === 1 ? 'Cyan' : 'Pink') : 'Your'} move${this.state.inHand[this.state.turn - 1] ? ' — place a piece' : ''}`;
    this.render();
  }

  private gameOver(w: 1 | 2 | 'draw') {
    if (this.opponent === '2p') {
      this.message = w === 'draw' ? 'Draw.' : `${w === 1 ? 'Cyan' : 'Pink'} wins!`;
      this.end('completed');
      return;
    }
    const result = w === 'draw' ? 'draw' : w === 1 ? 'won' : 'lost';
    this.setScore(versusScore(this.opponent, result, result === 'won' ? piecesLeft(this.state, 1) * 5 : 0));
    this.message = result === 'won' ? 'You win! 🎉' : result === 'lost' ? 'The computer wins.' : 'Draw.';
    if (result === 'won') this.sfx.win();
    this.end(result === 'won' ? 'won' : result === 'lost' ? 'lost' : 'completed');
  }

  private click(i: number) {
    if (this.thinking || (this.opponent !== '2p' && this.state.turn === 2)) return;
    const moves = legalMoves(this.state);
    if (this.pendingRemoval) {
      const m = this.pendingRemoval.find((x) => x.remove === i);
      if (m) this.commit(m);
      return;
    }
    const placing = this.state.inHand[this.state.turn - 1]! > 0;
    if (!placing && this.state.board[i] === this.state.turn) {
      this.from = i;
      this.render();
      return;
    }
    const candidates = moves.filter((m) => m.to === i && m.from === (placing ? -1 : this.from));
    if (!candidates.length) return;
    if (candidates[0]!.remove >= 0) {
      this.pendingRemoval = candidates;
      this.message = 'Mill! Choose an opponent piece to remove.';
      this.render();
    } else this.commit(candidates[0]!);
  }

  protected override onAction(action: string, value: string) {
    if (action === 'opponent' && this.state.plies === 0) {
      this.opponent = value as Opponent;
      this.reset();
      this.render();
    } else if (action === 'pt') this.click(Number(value));
  }

  protected view() {
    const removable = new Set(this.pendingRemoval?.map((m) => m.remove) ?? []);
    const targets = new Set(
      this.pendingRemoval ? [] : legalMoves(this.state).filter((m) => m.from === (this.state.inHand[this.state.turn - 1] ? -1 : this.from)).map((m) => m.to),
    );
    const pos = (i: number) => `left:${(COORDS[i]![1] / 6) * 100}%;top:${(COORDS[i]![0] / 6) * 100}%`;
    const points = this.state.board
      .map((v, i) => {
        const ring = removable.has(i) ? '#f43f5e' : i === this.from ? '#facc15' : targets.has(i) ? '#4ade80' : 'transparent';
        return `<button type="button" data-action="pt" data-value="${i}" aria-label="Point ${i + 1}${v ? (v === 1 ? ': cyan' : ': pink') : ''}" style="all:unset;position:absolute;${pos(i)};transform:translate(-50%,-50%);width:11%;aspect-ratio:1;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;background:${v ? COLORS[v] : '#a78bfa'};${v ? '' : 'transform:translate(-50%,-50%) scale(.45);'}box-shadow:0 0 0 4px ${ring}"></button>`;
      })
      .join('');
    const square = (inset: number) => `<span style="position:absolute;left:${inset}%;top:${inset}%;right:${inset}%;bottom:${inset}%;border:3px solid #6d4aff"></span>`;
    const lines = `${square(0)}${square(100 / 6)}${square(200 / 6)}
      <span style="position:absolute;left:50%;top:0;height:${100 / 3}%;border-left:3px solid #6d4aff"></span>
      <span style="position:absolute;left:50%;bottom:0;height:${100 / 3}%;border-left:3px solid #6d4aff"></span>
      <span style="position:absolute;top:50%;left:0;width:${100 / 3}%;border-top:3px solid #6d4aff"></span>
      <span style="position:absolute;top:50%;right:0;width:${100 / 3}%;border-top:3px solid #6d4aff"></span>`;
    const [h1, h2] = this.state.inHand;
    return `
      ${opponentBar(this.opponent, this.state.plies > 0)}
      <div class="pv-hud"><span>Cyan in hand <b>${h1}</b></span><span>Pink in hand <b>${h2}</b></span></div>
      <p class="pv-msg" role="status">${this.message}</p>
      <div style="position:relative;width:min(88%,440px);aspect-ratio:1;margin:18px">${lines}${points}</div>`;
  }
}

export default defineGame(
  { key: 'nine-mens-morris', engine: 'DOM', aspectRatio: 0.9, maxScore: 300 + 3 * 45, controls: [{ action: 'Place / move', keys: 'Click points' }] },
  (host) => new NineMensMorris(host),
);
