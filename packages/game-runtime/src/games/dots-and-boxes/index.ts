import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { opponentBar, versusScore, type Opponent } from '../../kit/versus';

const B = 4; // boxes per side
// Lines: horizontal h(r,c) r∈[0..B], c∈[0..B-1]; vertical v(r,c) r∈[0..B-1], c∈[0..B]
const H_COUNT = (B + 1) * B;
const LINES = H_COUNT + B * (B + 1);
const h = (r: number, c: number) => r * B + c;
const v = (r: number, c: number) => H_COUNT + r * (B + 1) + c;
const boxLines = (r: number, c: number) => [h(r, c), h(r + 1, c), v(r, c), v(r, c + 1)];

/** Boxes adjacent to a line. */
function boxesOf(line: number): [number, number][] {
  if (line < H_COUNT) {
    const r = Math.floor(line / B);
    const c = line % B;
    return ([[r - 1, c], [r, c]] as [number, number][]).filter(([rr]) => rr >= 0 && rr < B);
  }
  const k = line - H_COUNT;
  const r = Math.floor(k / (B + 1));
  const c = k % (B + 1);
  return ([[r, c - 1], [r, c]] as [number, number][]).filter(([, cc]) => cc >= 0 && cc < B);
}

export const sidesDrawn = (lines: boolean[], r: number, c: number) => boxLines(r, c).filter((l) => lines[l]).length;

/** Number of boxes the drawing player completes with `line`. */
export function completes(lines: boolean[], line: number) {
  return boxesOf(line).filter(([r, c]) => sidesDrawn(lines, r, c) === 3).length;
}

/** Boxes an opponent could greedily take after `line` is drawn (chain length estimate). */
function giveaway(lines: boolean[], line: number): number {
  const next = [...lines];
  next[line] = true;
  let taken = 0;
  for (let guard = 0; guard < 64; guard++) {
    const capture = next.findIndex((drawn, l) => !drawn && completes(next, l) > 0);
    if (capture < 0) break;
    taken += completes(next, capture);
    next[capture] = true;
  }
  return taken;
}

export function aiLine(lines: boolean[], random: () => number, level: Exclude<Opponent, '2p'>): number {
  const free = lines.flatMap((d, l) => (d ? [] : [l]));
  const take = free.filter((l) => completes(lines, l) > 0);
  if (take.length && level !== 'easy') return take[0]!;
  if (level === 'easy' && random() < 0.5) return free[Math.floor(random() * free.length)]!;
  const safe = free.filter((l) => boxesOf(l).every(([r, c]) => sidesDrawn(lines, r, c) < 2));
  if (safe.length) return safe[Math.floor(random() * safe.length)]!;
  if (take.length) return take[0]!;
  // Forced to open a chain: give away as little as possible.
  let best = free[0]!;
  let bestCost = Infinity;
  for (const l of free) {
    const cost = level === 'hard' ? giveaway(lines, l) : giveaway(lines, l) + random() * 2;
    if (cost < bestCost) {
      bestCost = cost;
      best = l;
    }
  }
  return best;
}

class DotsAndBoxes extends DomGame {
  private opponent: Opponent = 'medium';
  private lines: boolean[] = [];
  private owners: number[] = [];
  private turn: 1 | 2 = 1;
  private message = '';
  private thinking = false;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.lines = Array(LINES).fill(false);
    this.owners = Array(B * B).fill(0);
    this.turn = 1;
    this.thinking = false;
    this.message = this.opponent === '2p' ? 'Cyan to move' : 'Your move — complete a box to go again';
  }

  private draw(line: number) {
    if (this.lines[line]) return;
    this.lines[line] = true;
    let scored = 0;
    for (const [r, c] of boxesOf(line)) {
      if (sidesDrawn(this.lines, r, c) === 4 && !this.owners[r * B + c]) {
        this.owners[r * B + c] = this.turn;
        scored++;
      }
    }
    this.sfx.beep(scored ? 660 : 420, 0.04, 'triangle');
    if (this.lines.every(Boolean)) return this.gameOver();
    if (!scored) this.turn = this.turn === 1 ? 2 : 1;
    this.message = this.opponent === '2p' ? `${this.turn === 1 ? 'Cyan' : 'Pink'} to move` : this.turn === 1 ? 'Your move' : 'Computer is moving…';
    if (this.opponent !== '2p' && this.turn === 2) {
      this.thinking = true;
      this.render();
      this.schedule(380, () => {
        this.thinking = false;
        this.draw(aiLine(this.lines, this.random, this.opponent as Exclude<Opponent, '2p'>));
      });
      return;
    }
    this.render();
  }

  private gameOver() {
    const a = this.owners.filter((o) => o === 1).length;
    const b = this.owners.filter((o) => o === 2).length;
    if (this.opponent === '2p') {
      this.message = a === b ? `Draw ${a}–${b}` : `${a > b ? 'Cyan' : 'Pink'} wins ${Math.max(a, b)}–${Math.min(a, b)}`;
      this.end('completed');
      return;
    }
    const result = a > b ? 'won' : a < b ? 'lost' : 'draw';
    this.setScore(versusScore(this.opponent, result, result === 'won' ? (a - b) * 5 : 0));
    this.message = result === 'won' ? `You win ${a}–${b}! 🎉` : result === 'lost' ? `The computer wins ${b}–${a}.` : `Draw ${a}–${b}.`;
    if (result === 'won') this.sfx.win();
    this.end(result === 'won' ? 'won' : result === 'lost' ? 'lost' : 'completed');
  }

  protected override onAction(action: string, value: string) {
    if (action === 'opponent' && !this.lines.some(Boolean)) {
      this.opponent = value as Opponent;
      this.reset();
      this.render();
    } else if (action === 'line' && !this.thinking && (this.opponent === '2p' || this.turn === 1)) this.draw(Number(value));
  }

  protected view() {
    // 2B+1 grid: even/even = dot, even/odd = h-line, odd/even = v-line, odd/odd = box
    const size = 2 * B + 1;
    const cells: string[] = [];
    const lineBtn = (l: number, horizontal: boolean) => {
      const drawn = this.lines[l];
      return `<button type="button" data-action="line" data-value="${l}" aria-label="${horizontal ? 'Horizontal' : 'Vertical'} line${drawn ? ' (drawn)' : ''}" ${drawn ? 'disabled' : ''} style="all:unset;cursor:${drawn ? 'default' : 'pointer'};display:flex;align-items:center;justify-content:center;${horizontal ? 'height:100%' : 'width:100%'}"><span style="display:block;${horizontal ? 'width:100%;height:8px' : 'width:8px;height:100%'};border-radius:4px;background:${drawn ? '#e6e9f5' : 'rgba(148,163,255,.18)'}"></span></button>`;
    };
    for (let gr = 0; gr < size; gr++)
      for (let gc = 0; gc < size; gc++) {
        if (gr % 2 === 0 && gc % 2 === 0) cells.push('<span style="display:flex;align-items:center;justify-content:center"><span style="width:12px;height:12px;border-radius:50%;background:#a78bfa"></span></span>');
        else if (gr % 2 === 0) cells.push(lineBtn(h(gr / 2, (gc - 1) / 2), true));
        else if (gc % 2 === 0) cells.push(lineBtn(v((gr - 1) / 2, gc / 2), false));
        else {
          const o = this.owners[((gr - 1) / 2) * B + (gc - 1) / 2];
          cells.push(`<span style="display:flex;align-items:center;justify-content:center;border-radius:6px;background:${o === 1 ? 'rgba(34,211,238,.35)' : o === 2 ? 'rgba(244,114,182,.35)' : 'transparent'};font-weight:800">${o === 1 ? (this.opponent === '2p' ? 'C' : 'You') : o === 2 ? (this.opponent === '2p' ? 'P' : 'CPU') : ''}</span>`);
        }
      }
    const tracks = Array.from({ length: size }, (_, k) => (k % 2 === 0 ? '16px' : '1fr')).join(' ');
    const a = this.owners.filter((o) => o === 1).length;
    const b = this.owners.filter((o) => o === 2).length;
    return `
      ${opponentBar(this.opponent, this.lines.some(Boolean))}
      <div class="pv-hud"><span>${this.opponent === '2p' ? 'Cyan' : 'You'} <b>${a}</b></span><span>${this.opponent === '2p' ? 'Pink' : 'CPU'} <b>${b}</b></span></div>
      <p class="pv-msg" role="status">${this.message}</p>
      <div style="display:grid;grid-template-columns:${tracks};grid-template-rows:${tracks};width:min(100%,420px);aspect-ratio:1">${cells.join('')}</div>`;
  }
}

export default defineGame(
  { key: 'dots-and-boxes', engine: 'DOM', aspectRatio: 0.9, maxScore: 300 + 3 * 80, controls: [{ action: 'Draw line', keys: 'Click between two dots' }] },
  (host) => new DotsAndBoxes(host),
);
