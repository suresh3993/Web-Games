import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { ORTHO, formatTime, shuffle } from '../../kit/util';

const N = 8;
const REGION_COLORS = ['#3730a3', '#9d174d', '#065f46', '#92400e', '#1e40af', '#6b21a8', '#115e59', '#7f1d1d'];

/** One star per row, columns form a permutation, no two stars touch (incl. diagonally). */
function starColumns(random: () => number): number[] {
  const cols: number[] = [];
  const go = (r: number): boolean => {
    if (r === N) return true;
    for (const c of shuffle(random, [...Array(N).keys()])) {
      if (cols.includes(c) || (r > 0 && Math.abs(cols[r - 1]! - c) <= 1)) continue;
      cols.push(c);
      if (go(r + 1)) return true;
      cols.pop();
    }
    return false;
  };
  go(0);
  return cols;
}

/** Grows one region around each star (random multi-source flood) → every region holds exactly one star. */
export function generateStarBattle(random: () => number): { regions: number[]; stars: number[] } {
  const cols = starColumns(random);
  const stars = cols.map((c, r) => r * N + c);
  const regions = Array(N * N).fill(-1);
  stars.forEach((s, k) => (regions[s] = k));
  const frontier = stars.map((s) => [s]);
  let left = N * N - N;
  while (left > 0) {
    const k = Math.floor(random() * N);
    const options = frontier[k]!.flatMap((i) =>
      ORTHO.map(([dr, dc]) => [Math.floor(i / N) + dr, (i % N) + dc]).filter(([r, c]) => r! >= 0 && c! >= 0 && r! < N && c! < N && regions[r! * N + c!] < 0).map(([r, c]) => r! * N + c!),
    );
    if (!options.length) continue;
    const next = options[Math.floor(random() * options.length)]!;
    regions[next] = k;
    frontier[k]!.push(next);
    left--;
  }
  return { regions, stars };
}

export function validStars(stars: number[], regions: number[]): boolean {
  if (stars.length !== N) return false;
  const rows = new Set(stars.map((s) => Math.floor(s / N)));
  const cols = new Set(stars.map((s) => s % N));
  const regs = new Set(stars.map((s) => regions[s]));
  if (rows.size !== N || cols.size !== N || regs.size !== N) return false;
  return stars.every((a) => stars.every((b) => a === b || Math.max(Math.abs(Math.floor(a / N) - Math.floor(b / N)), Math.abs((a % N) - (b % N))) > 1));
}

class StarBattle extends DomGame {
  private regions: number[] = [];
  private marks: number[] = []; // 0 empty, 1 dot, 2 star
  private shownSecond = -1;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.regions = generateStarBattle(this.random).regions;
    this.marks = Array(N * N).fill(0);
  }

  protected override onTick() {
    const s = Math.floor(this.elapsed);
    if (s !== this.shownSecond) {
      this.shownSecond = s;
      this.render();
    }
  }

  private conflicts(): Set<number> {
    const stars = this.marks.flatMap((m, i) => (m === 2 ? [i] : []));
    const bad = new Set<number>();
    for (const a of stars)
      for (const b of stars) {
        if (a === b) continue;
        const sameLine = Math.floor(a / N) === Math.floor(b / N) || a % N === b % N || this.regions[a] === this.regions[b];
        const touching = Math.max(Math.abs(Math.floor(a / N) - Math.floor(b / N)), Math.abs((a % N) - (b % N))) <= 1;
        if (sameLine || touching) bad.add(a);
      }
    return bad;
  }

  protected override onAction(action: string, value: string, event: Event) {
    if (action !== 'cell') return;
    const i = Number(value);
    this.marks[i] = event.type === 'contextmenu' ? (this.marks[i] === 1 ? 0 : 1) : ((this.marks[i]! + 1) % 3);
    this.sfx.click();
    const stars = this.marks.flatMap((m, k) => (m === 2 ? [k] : []));
    if (validStars(stars, this.regions)) {
      this.setScore(2000 + Math.max(0, 900 - Math.floor(this.elapsed)) * 2);
      this.sfx.win();
      this.end('won', { seconds: Math.floor(this.elapsed) });
      return;
    }
    this.render();
  }

  protected view() {
    const bad = this.conflicts();
    const cells = this.marks
      .map((m, i) => {
        const r = Math.floor(i / N);
        const c = i % N;
        const reg = this.regions[i]!;
        const edge = (rr: number, cc: number) => (rr < 0 || cc < 0 || rr >= N || cc >= N || this.regions[rr * N + cc] !== reg ? '3px solid #e6e9f5' : '1px solid rgba(255,255,255,.15)');
        const content = m === 2 ? `<span style="color:${bad.has(i) ? '#fb7185' : '#fde047'};font-size:clamp(16px,4.4vmin,30px)">★</span>` : m === 1 ? '<span style="width:18%;height:18%;border-radius:50%;background:#cbd5e1"></span>' : '';
        return `<button type="button" class="pv-cell" style="border-radius:0;background:${REGION_COLORS[reg]};border-top:${edge(r - 1, c)};border-bottom:${edge(r + 1, c)};border-left:${edge(r, c - 1)};border-right:${edge(r, c + 1)}" data-action="cell" data-value="${i}" aria-label="Row ${r + 1} column ${c + 1}, region ${reg + 1}${m === 2 ? ': star' : m === 1 ? ': dot' : ''}">${content}</button>`;
      })
      .join('');
    return `
      <div class="pv-hud"><span>Stars <b>${this.marks.filter((m) => m === 2).length}/${N}</b></span><span>Time <b>${formatTime(this.elapsed)}</b></span></div>
      <p class="pv-msg">One star in every row, column and outlined region — stars may not touch, even diagonally.</p>
      <div class="pv-grid" style="--cols:${N};--gap:0px;--w:440px">${cells}</div>
      <p class="pv-muted">Click cycles: empty → dot → star. Right-click places a dot.</p>`;
  }
}

export default defineGame(
  { key: 'star-battle', engine: 'DOM', aspectRatio: 0.85, maxScore: 3_800, controls: [{ action: 'Mark', keys: 'Click (cycle) / right-click dot' }] },
  (host) => new StarBattle(host),
);
