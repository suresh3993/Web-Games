import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { opponentBar, versusScore, type Opponent } from '../../kit/versus';
import { applyMove, evaluate, initial, legalSequences, pipCount, winner, type BgMove, type BgState, type Sequence } from './logic';

const DICE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

class Backgammon extends DomGame {
  private opponent: Opponent = 'medium';
  private state: BgState = initial();
  private turn: 0 | 1 = 0;
  private dice: [number, number] | null = null;
  private sequences: Sequence[] = [];
  private played: BgMove[] = [];
  private selected: number | 'bar' | null = null;
  private message = '';
  private started = false;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.state = initial();
    this.turn = 0;
    this.dice = null;
    this.sequences = [];
    this.played = [];
    this.selected = null;
    this.started = false;
    this.message = 'Roll the dice to start. You move counter-clockwise toward the bottom-right.';
  }

  private roll() {
    const d1 = 1 + Math.floor(this.random() * 6);
    const d2 = 1 + Math.floor(this.random() * 6);
    this.dice = [d1, d2];
    this.started = true;
    this.played = [];
    this.selected = null;
    this.sequences = legalSequences(this.state, this.turn, this.dice);
    this.sfx.beep(520, 0.05, 'square', 0.04);
    if (!this.sequences[0]?.moves.length) {
      this.message = `${this.who()} rolled ${d1}-${d2} — no legal moves.`;
      this.render();
      this.schedule(1200, () => this.endTurn());
      return;
    }
    if (this.isComputerTurn()) {
      this.message = `Computer rolled ${d1}-${d2}…`;
      this.render();
      this.schedule(700, () => this.computerPlay());
      return;
    }
    this.message = `${this.who()} rolled ${d1}-${d2}. Select a checker.`;
    this.render();
  }

  private who() {
    return this.opponent === '2p' ? (this.turn === 0 ? 'Cyan' : 'Pink') : this.turn === 0 ? 'You' : 'Computer';
  }

  private isComputerTurn() {
    return this.opponent !== '2p' && this.turn === 1;
  }

  private computerPlay() {
    const noise = this.opponent === 'easy' ? 25 : this.opponent === 'medium' ? 4 : 0;
    let best = this.sequences[0]!;
    let bestScore = -Infinity;
    for (const seq of this.sequences) {
      const v = evaluate(seq.state, 1) + this.random() * noise;
      if (v > bestScore) {
        bestScore = v;
        best = seq;
      }
    }
    this.state = best.state;
    this.sfx.click();
    if (winner(this.state) !== null) return this.gameOver();
    this.endTurn();
  }

  /** Sequences still consistent with the moves the human has played this turn. */
  private remaining() {
    return this.sequences.filter((q) => this.played.every((m, k) => sameMove(q.moves[k], m)));
  }

  private nextOptions(): BgMove[] {
    const k = this.played.length;
    const seen = new Map<string, BgMove>();
    for (const q of this.remaining()) {
      const m = q.moves[k];
      if (m) seen.set(`${m.from}-${m.to}-${m.die}`, m);
    }
    return [...seen.values()];
  }

  private humanMove(m: BgMove) {
    this.state = applyMove(this.state, this.turn, m);
    this.played.push(m);
    this.selected = null;
    this.sfx.click();
    if (winner(this.state) !== null) return this.gameOver();
    if (!this.nextOptions().length) {
      this.endTurn();
      return;
    }
    this.message = 'Keep moving — use your remaining dice.';
    this.render();
  }

  private endTurn() {
    this.turn = this.turn === 0 ? 1 : 0;
    this.dice = null;
    this.sequences = [];
    this.played = [];
    this.selected = null;
    if (this.isComputerTurn()) {
      this.message = 'Computer is rolling…';
      this.render();
      this.schedule(600, () => this.roll());
      return;
    }
    this.message = `${this.who()}: roll the dice.`;
    this.render();
  }

  private gameOver() {
    const w = winner(this.state)!;
    if (this.opponent === '2p') {
      this.message = `${w === 0 ? 'Cyan' : 'Pink'} bears off all 15 and wins!`;
      this.end('completed');
      return;
    }
    const won = w === 0;
    const gammon = this.state.off[won ? 1 : 0] === 0;
    this.setScore(versusScore(this.opponent, won ? 'won' : 'lost', won ? (gammon ? 100 : 0) + Math.floor(pipCount(this.state, 1) / 10) : 0));
    this.message = won ? (gammon ? 'Gammon! You win big! 🎉' : 'You bore off first — you win! 🎉') : 'The computer bore off first.';
    if (won) this.sfx.win();
    this.end(won ? 'won' : 'lost');
  }

  protected override onAction(action: string, value: string) {
    if (action === 'opponent' && !this.started) {
      this.opponent = value as Opponent;
      this.reset();
      this.render();
      return;
    }
    if (action === 'roll' && !this.dice && !this.isComputerTurn()) return this.roll();
    if (!this.dice || this.isComputerTurn()) return;
    const options = this.nextOptions();
    if (action === 'point' || action === 'bar') {
      const target: number | 'bar' = action === 'bar' ? 'bar' : Number(value);
      if (this.selected !== null && target !== 'bar') {
        const m = options.find((o) => o.from === this.selected && o.to === target);
        if (m) return this.humanMove(m);
      }
      if (options.some((o) => o.from === target)) {
        this.selected = target;
        this.render();
      }
      return;
    }
    if (action === 'off' && this.selected !== null) {
      const m = options.find((o) => o.from === this.selected && o.to === 'off');
      if (m) this.humanMove(m);
    }
  }

  protected view() {
    const options = this.dice && !this.isComputerTurn() ? this.nextOptions() : [];
    const fromSet = new Set(options.map((o) => String(o.from)));
    const toSet = new Set(options.filter((o) => o.from === this.selected).map((o) => String(o.to)));
    const point = (i: number, top: boolean) => {
      const v = this.state.points[i]!;
      const n = Math.abs(v);
      const color = v > 0 ? '#22d3ee' : '#f472b6';
      const checkers = Array.from({ length: Math.min(n, 5) }, (_, k) => `<span style="width:78%;aspect-ratio:1;border-radius:50%;background:${color};border:2px solid rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:11px;color:#0b1022;font-weight:800">${k === 4 && n > 5 ? n : ''}</span>`).join('');
      const tri = i % 2 ? '#3b4a8f' : '#6d4aff';
      const highlight = String(this.selected) === String(i) ? 'box-shadow:inset 0 0 0 3px #facc15;' : toSet.has(String(i)) ? 'box-shadow:inset 0 0 0 3px #4ade80;' : fromSet.has(String(i)) ? 'box-shadow:inset 0 0 0 2px rgba(34,211,238,.6);' : '';
      return `<button type="button" data-action="point" data-value="${i}" aria-label="Point ${i + 1}: ${n} ${v > 0 ? 'cyan' : v < 0 ? 'pink' : ''}" style="all:unset;cursor:pointer;display:flex;flex-direction:${top ? 'column' : 'column-reverse'};align-items:center;gap:2px;height:100%;padding:2px 0;border-radius:6px;background:linear-gradient(${top ? '180deg' : '0deg'},${tri} 0,${tri} 55%,transparent 55%);${highlight}">${checkers}</button>`;
    };
    // Top row shows points 12..23 left→right; bottom shows 11..0 left→right.
    const topRow = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23].map((i) => point(i, true)).join('');
    const bottomRow = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map((i) => point(i, false)).join('');
    const dice = this.dice ? `<span style="font-size:40px;line-height:1">${DICE[this.dice[0]]}${DICE[this.dice[1]]}</span>` : '';
    const canOff = toSet.has('off');
    return `
      ${opponentBar(this.opponent, this.started)}
      <div class="pv-hud"><span>Pips you <b>${pipCount(this.state, 0)}</b></span><span>Pips CPU <b>${pipCount(this.state, 1)}</b></span><span>Off <b>${this.state.off[0]}–${this.state.off[1]}</b></span></div>
      <p class="pv-msg" role="status">${this.message}</p>
      <div class="pv-row">${dice}
        <button type="button" class="pv-btn primary" data-action="roll" data-value="" ${this.dice || this.isComputerTurn() ? 'disabled' : ''}>🎲 Roll</button>
        <button type="button" class="pv-btn" data-action="bar" data-value="" ${fromSet.has('bar') ? '' : 'disabled'}>Bar ${this.state.bar[0]}/${this.state.bar[1]}</button>
        <button type="button" class="pv-btn${canOff ? ' primary' : ''}" data-action="off" data-value="" ${canOff ? '' : 'disabled'}>Bear off</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(12,1fr);grid-template-rows:1fr 1fr;gap:4px 3px;width:min(100%,760px);height:min(60vh,420px);padding:8px;border-radius:12px;background:#0e1430;border:6px solid #3b2f1a">${topRow}${bottomRow}</div>
      <p class="pv-muted">Select a highlighted checker, then a green point. Bear off once all your checkers are in your home (bottom-right).</p>`;
  }
}

function sameMove(a: BgMove | undefined, b: BgMove) {
  return !!a && a.from === b.from && a.to === b.to && a.die === b.die;
}

export default defineGame(
  { key: 'backgammon', engine: 'DOM', aspectRatio: 1.5, orientation: 'landscape', maxScore: 3 * 100 + 3 * 130, controls: [{ action: 'Move', keys: 'Roll, then click a checker and a destination' }] },
  (host) => new Backgammon(host),
);
