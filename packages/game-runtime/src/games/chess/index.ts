import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { opponentBar, versusScore, type Opponent } from '../../kit/versus';
import { chooseMove, initialState, inCheck, legalMoves, makeMove, outcome, sqName, type ChessState, type Move, type PieceType } from './logic';

const GLYPHS: Record<string, string> = { wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙', bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟' };
const NAMES: Record<PieceType, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const AI = { easy: { depth: 1, blunder: 0.25 }, medium: { depth: 2, blunder: 0.05 }, hard: { depth: 3, blunder: 0 } } as const;

class Chess extends DomGame {
  private opponent: Opponent = 'easy';
  private state: ChessState = initialState();
  private selected = -1;
  private targets: Move[] = [];
  private pendingPromo: Move[] | null = null;
  private last: Move | null = null;
  private history: string[] = [];
  private thinking = false;
  private message = '';

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.state = initialState();
    this.selected = -1;
    this.targets = [];
    this.pendingPromo = null;
    this.last = null;
    this.history = [];
    this.thinking = false;
    this.message = this.opponent === '2p' ? 'White to move' : 'You play White';
  }

  private get humanTurn() {
    return this.opponent === '2p' || this.state.turn === 'w';
  }

  private play(m: Move) {
    const piece = this.state.board[m.from]!;
    this.history.push(`${piece.type === 'p' ? '' : piece.type.toUpperCase()}${sqName(m.from)}${m.capture ? 'x' : '-'}${sqName(m.to)}${m.promo ? `=${m.promo.toUpperCase()}` : ''}`);
    this.state = makeMove(this.state, m);
    this.last = m;
    this.selected = -1;
    this.targets = [];
    this.pendingPromo = null;
    this.sfx.beep(m.capture ? 300 : 440, 0.05, 'triangle');
    const result = outcome(this.state);
    if (result) return this.finishGame(result);
    const check = inCheck(this.state) ? ' — check!' : '';
    if (this.opponent !== '2p' && this.state.turn === 'b') {
      this.thinking = true;
      this.message = `Computer is thinking…${check}`;
      this.render();
      this.schedule(250, () => this.computerMove());
    } else {
      this.message = `${this.state.turn === 'w' ? 'White' : 'Black'} to move${check}`;
      this.render();
    }
  }

  private computerMove() {
    if (this.opponent === '2p') return;
    const { depth, blunder } = AI[this.opponent];
    const m = chooseMove(this.state, depth, this.random, blunder);
    this.thinking = false;
    if (m) this.play(m);
  }

  private finishGame(result: NonNullable<ReturnType<typeof outcome>>) {
    const reason = result.result === 'checkmate' ? 'Checkmate' : result.result === 'stalemate' ? 'Stalemate' : result.result === 'fifty-move' ? 'Draw by the 50-move rule' : 'Draw — insufficient material';
    if (this.opponent === '2p') {
      this.message = result.result === 'checkmate' ? `${reason} — ${result.winner === 'w' ? 'White' : 'Black'} wins!` : reason;
      this.end('completed');
      return;
    }
    const outcomeKey = result.result === 'checkmate' ? (result.winner === 'w' ? 'won' : 'lost') : 'draw';
    const quickBonus = outcomeKey === 'won' ? Math.max(0, 60 - this.state.fullmove) * 2 : 0;
    this.setScore(versusScore(this.opponent, outcomeKey, quickBonus));
    this.message = outcomeKey === 'won' ? `${reason} — you win! 🎉` : outcomeKey === 'lost' ? `${reason} — the computer wins.` : reason;
    if (outcomeKey === 'won') this.sfx.win();
    this.end(outcomeKey === 'won' ? 'won' : outcomeKey === 'lost' ? 'lost' : 'completed');
  }

  private click(i: number) {
    if (!this.humanTurn || this.thinking || this.pendingPromo) return;
    const piece = this.state.board[i];
    const moves = this.targets.filter((m) => m.to === i);
    if (moves.length) {
      if (moves.length > 1) {
        this.pendingPromo = moves;
        this.render();
      } else this.play(moves[0]!);
      return;
    }
    if (piece && piece.color === this.state.turn) {
      this.selected = i;
      this.targets = legalMoves(this.state).filter((m) => m.from === i);
    } else {
      this.selected = -1;
      this.targets = [];
    }
    this.render();
  }

  protected override onAction(action: string, value: string) {
    if (action === 'opponent' && !this.history.length) {
      this.opponent = value as Opponent;
      this.reset();
      this.render();
    } else if (action === 'sq') this.click(Number(value));
    else if (action === 'promo' && this.pendingPromo) {
      const m = this.pendingPromo.find((x) => x.promo === value);
      if (m) this.play(m);
    }
  }

  protected view() {
    const targetSquares = new Set(this.targets.map((m) => m.to));
    const flip = this.opponent === '2p' && this.state.turn === 'b' && !this.finished;
    const order = [...Array(64).keys()];
    if (flip) order.reverse();
    const checkSq = inCheck(this.state) ? this.state.board.findIndex((p) => p?.type === 'k' && p.color === this.state.turn) : -1;
    const cells = order
      .map((i) => {
        const p = this.state.board[i];
        const dark = (Math.floor(i / 8) + (i % 8)) % 2 === 1;
        let bg = dark ? '#3b4a8f' : '#8b9be0';
        if (this.last && (i === this.last.from || i === this.last.to)) bg = dark ? '#6b5bd6' : '#a99bf2';
        if (i === this.selected) bg = '#22d3ee';
        if (i === checkSq) bg = '#f43f5e';
        const dot = targetSquares.has(i) ? `<span style="position:absolute;width:${p ? '86%' : '28%'};height:${p ? '86%' : '28%'};border-radius:50%;${p ? 'border:4px solid rgba(7,10,23,.55)' : 'background:rgba(7,10,23,.45)'}"></span>` : '';
        const glyph = p ? `<span style="font-size:clamp(22px,6.4vmin,48px);line-height:1;color:${p.color === 'w' ? '#fff' : '#0b1022'};text-shadow:${p.color === 'w' ? '0 0 2px #000,0 1px 2px #000' : '0 0 2px #fff'}">${GLYPHS[p.color + p.type]}</span>` : '';
        const label = `${sqName(i)}${p ? `, ${p.color === 'w' ? 'white' : 'black'} ${NAMES[p.type]}` : ''}`;
        return `<button type="button" class="pv-cell" style="border-radius:0;border:0;background:${bg}" data-action="sq" data-value="${i}" aria-label="${label}">${dot}${glyph}</button>`;
      })
      .join('');
    const promo = this.pendingPromo
      ? `<div class="pv-row" role="group" aria-label="Choose promotion">${(['q', 'r', 'b', 'n'] as PieceType[]).map((t) => `<button type="button" class="pv-btn" style="font-size:24px" data-action="promo" data-value="${t}" aria-label="Promote to ${NAMES[t]}">${GLYPHS[this.state.turn + t]}</button>`).join('')}</div>`
      : '';
    return `
      ${opponentBar(this.opponent, this.history.length > 0)}
      <p class="pv-msg" role="status">${this.message}</p>
      ${promo}
      <div class="pv-grid" style="--cols:8;--gap:0px;--w:520px;border:6px solid #1b2350;border-radius:8px;overflow:hidden">${cells}</div>
      <p class="pv-muted">Moves: ${this.history.length ? this.history.slice(-8).join('  ') : '—'}</p>`;
  }
}

export default defineGame(
  { key: 'chess', engine: 'DOM', aspectRatio: 0.85, maxScore: 3 * 100 + 3 * 120, controls: [{ action: 'Move', keys: 'Click a piece, then a highlighted square' }] },
  (host) => new Chess(host),
);
