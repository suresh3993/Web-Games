import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { opponentBar, versusScore, type Opponent } from '../../kit/versus';
import { aiMove, initial, KOMI, N, play, score, type GoState } from './logic';

const NOISE = { easy: 6, medium: 2, hard: 0.5 } as const;
const MAX_MOVES = 160;

class Go9x9 extends DomGame {
  private opponent: Opponent = 'medium';
  private state: GoState = initial();
  private moves = 0;
  private last = -1;
  private message = '';
  private thinking = false;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.state = initial();
    this.moves = 0;
    this.last = -1;
    this.thinking = false;
    this.message = `You play Black. White receives ${KOMI} komi. Two passes end the game.`;
  }

  private advance(point: number) {
    const next = play(this.state, point);
    if (!next) {
      this.message = 'Illegal move (suicide or ko).';
      this.sfx.bad();
      this.render();
      return;
    }
    const who = this.state.turn === 1 ? 'Black' : 'White';
    this.state = next;
    this.moves++;
    this.last = point;
    if (point >= 0) this.sfx.click();
    if (this.state.passes >= 2 || this.moves >= MAX_MOVES) return this.gameOver();
    this.message = point < 0 ? `${who} passed.` : '';
    if (this.opponent !== '2p' && this.state.turn === 2) {
      this.thinking = true;
      this.render();
      this.schedule(350, () => {
        this.thinking = false;
        this.advance(aiMove(this.state, this.random, NOISE[this.opponent as Exclude<Opponent, '2p'>]));
      });
      return;
    }
    this.render();
  }

  private gameOver() {
    const { black, white } = score(this.state.board);
    const summary = `Black ${black} – White ${white}`;
    if (this.opponent === '2p') {
      this.message = `${black > white ? 'Black' : 'White'} wins. ${summary}`;
      this.end('completed');
      return;
    }
    const won = black > white;
    this.setScore(versusScore(this.opponent, won ? 'won' : 'lost', won ? Math.round(black - white) * 3 : 0));
    this.message = `${won ? 'You win! 🎉' : 'White wins.'} ${summary}`;
    if (won) this.sfx.win();
    this.end(won ? 'won' : 'lost', { black, white: Math.round(white) });
  }

  protected override onAction(action: string, value: string) {
    if (action === 'opponent' && this.moves === 0) {
      this.opponent = value as Opponent;
      this.reset();
      this.render();
      return;
    }
    if (this.thinking || (this.opponent !== '2p' && this.state.turn === 2)) return;
    if (action === 'pt') this.advance(Number(value));
    if (action === 'pass') this.advance(-1);
  }

  protected view() {
    const territory = this.finished ? score(this.state.board).territory : [];
    const cells = this.state.board
      .map((v, i) => {
        const r = Math.floor(i / N);
        const c = i % N;
        const h = `linear-gradient(#5b3d14,#5b3d14) ${c === 0 ? 'right' : c === N - 1 ? 'left' : 'center'}/${c === 0 || c === N - 1 ? '50%' : '100%'} 1.5px no-repeat`;
        const vline = `linear-gradient(#5b3d14,#5b3d14) ${r === 0 ? 'bottom' : r === N - 1 ? 'top' : 'center'}/1.5px ${r === 0 || r === N - 1 ? '50%' : '100%'} no-repeat`;
        const stone = v
          ? `<span style="width:88%;height:88%;border-radius:50%;background:${v === 1 ? 'radial-gradient(circle at 35% 35%,#4b5563,#030712)' : 'radial-gradient(circle at 35% 35%,#fff,#cbd5e1)'};${i === this.last ? 'box-shadow:0 0 0 2px #f43f5e' : ''}"></span>`
          : territory[i]
            ? `<span style="width:30%;height:30%;background:${territory[i] === 1 ? '#030712' : '#fff'}"></span>`
            : '';
        return `<button type="button" class="pv-cell" style="border-radius:0;border:0;background:${h},${vline},transparent" data-action="pt" data-value="${i}" aria-label="Point ${String.fromCharCode(65 + c)}${N - r}${v ? (v === 1 ? ': black' : ': white') : ''}">${stone}</button>`;
      })
      .join('');
    const [bc, wc] = this.state.captures;
    return `
      ${opponentBar(this.opponent, this.moves > 0)}
      <div class="pv-hud"><span>Black captures <b>${bc}</b></span><span>White captures <b>${wc}</b></span><span>Moves <b>${this.moves}</b></span></div>
      <p class="pv-msg" role="status">${this.thinking ? 'White is thinking…' : this.message || (this.state.turn === 1 ? 'Black to play' : 'White to play')}</p>
      <div class="pv-grid" style="--cols:${N};--gap:0px;--w:480px;padding:10px;background:#dcb35c;border-radius:8px">${cells}</div>
      <button type="button" class="pv-btn" data-action="pass" data-value="">Pass</button>`;
  }
}

export default defineGame(
  { key: 'go-9x9', engine: 'DOM', aspectRatio: 0.85, maxScore: 300 + 3 * 250, controls: [{ action: 'Place stone', keys: 'Click an intersection' }, { action: 'Pass', keys: 'Pass button' }] },
  (host) => new Go9x9(host),
);
