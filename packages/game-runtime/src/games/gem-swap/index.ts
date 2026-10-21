import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { shuffle } from '../../kit/util';
import { adjacent, hasMove, isValidSwap, KINDS, randomBoard, resolveStep, SIZE, swap, type Board } from './logic';

const MOVES = 30;
const GEMS = ['◆', '●', '▲', '■', '★', '⬟'];
const COLORS = ['#f43f5e', '#22d3ee', '#facc15', '#4ade80', '#a78bfa', '#fb923c'];

class GemSwap extends DomGame {
  private board: Board = [];
  private selected = -1;
  private moves = MOVES;
  private busy = false;
  private combo = 0;
  private message = '';

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    do this.board = randomBoard(this.random);
    while (!hasMove(this.board));
    this.selected = -1;
    this.moves = MOVES;
    this.busy = false;
    this.combo = 0;
    this.message = 'Swap neighbouring gems to make lines of three.';
  }

  private trySwap(a: number, b: number) {
    if (!isValidSwap(this.board, a, b)) {
      this.message = 'No match there — try another swap.';
      this.sfx.bad();
      this.selected = -1;
      this.render();
      return;
    }
    this.board = swap(this.board, a, b);
    this.moves--;
    this.selected = -1;
    this.combo = 0;
    this.busy = true;
    this.cascade([a, b]);
  }

  private cascade(focus: number[]) {
    const { board, cleared } = resolveStep(this.board, this.random, focus);
    if (cleared > 0) {
      this.combo++;
      this.board = board;
      this.addScore(cleared * 10 * this.combo);
      this.message = this.combo > 1 ? `Cascade ×${this.combo}!` : `+${cleared * 10}`;
      this.sfx.beep(420 + this.combo * 80, 0.07, 'triangle');
      this.render();
      this.schedule(260, () => this.cascade([]));
      return;
    }
    this.busy = false;
    if (!hasMove(this.board)) {
      // Reshuffle colours (keeping specials) until a move exists and nothing is pre-matched.
      let attempt = this.board;
      do {
        const gems = shuffle(this.random, attempt.filter(Boolean)) as NonNullable<Board[number]>[];
        attempt = gems;
      } while (!hasMove(attempt) || resolveStep(attempt, () => 0).cleared > 0);
      this.board = attempt;
      this.message = 'No moves left — gems reshuffled.';
    }
    if (this.moves <= 0) {
      this.end('completed', { moves: MOVES });
      return;
    }
    this.render();
  }

  protected override onAction(action: string, value: string) {
    if (action !== 'gem' || this.busy) return;
    const i = Number(value);
    if (this.selected < 0) this.selected = i;
    else if (this.selected === i) this.selected = -1;
    else if (adjacent(this.selected, i)) return this.trySwap(this.selected, i);
    else this.selected = i;
    this.sfx.click();
    this.render();
  }

  protected view() {
    const cells = this.board
      .map((g, i) => {
        if (!g) return '<div class="pv-cell"></div>';
        const special = g.special === 'line' ? 'box-shadow:inset 0 0 0 3px #fff;' : g.special === 'star' ? 'background:radial-gradient(circle,#fff 0,#6d4aff 70%);' : '';
        const glyph = g.special === 'star' ? '✸' : GEMS[g.color % KINDS];
        return `<button type="button" class="pv-cell${i === this.selected ? ' sel' : ''}" style="color:${COLORS[g.color]};font-size:clamp(18px,4.6vmin,32px);${special}" data-action="gem" data-value="${i}" aria-label="Gem ${g.color + 1}${g.special !== 'none' ? ` (${g.special})` : ''}">${glyph}</button>`;
      })
      .join('');
    return `
      <div class="pv-hud"><span>Score <b>${this.score}</b></span><span>Moves left <b>${this.moves}</b></span></div>
      <p class="pv-msg" role="status">${this.message}</p>
      <div class="pv-grid" style="--cols:${SIZE};--gap:4px;--w:480px">${cells}</div>
      <p class="pv-muted">Match 4 for a line gem (clears row + column) · match 5 for a star (clears a colour).</p>`;
  }
}

export default defineGame(
  { key: 'gem-swap', engine: 'DOM', aspectRatio: 0.9, maxScore: 250_000, controls: [{ action: 'Swap', keys: 'Click two neighbouring gems' }] },
  (host) => new GemSwap(host),
);
