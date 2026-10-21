import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { esc, formatTime, pick } from '../../kit/util';

/** Hand-drawn original pixel pictures ('#' = filled). */
const PICTURES: { name: string; rows: string[] }[] = [
  { name: 'Heart', rows: ['..##..##..', '.####.####', '##########', '##########', '##########', '.########.', '..######..', '...####...', '....##....', '..........'] },
  { name: 'Rocket', rows: ['....##....', '...####...', '...#..#...', '...####...', '...####...', '..######..', '.##.##.##.', '.#..##..#.', '....##....', '...#..#...'] },
  { name: 'Cat', rows: ['.#......#.', '.##....##.', '.########.', '##.####.##', '##########', '###.##.###', '.########.', '..######..', '.##....##.', '##......##'] },
  { name: 'Tree', rows: ['....##....', '...####...', '..######..', '...####...', '..######..', '.########.', '..######..', '.########.', '....##....', '...####...'] },
  { name: 'Key', rows: ['.####.....', '##..##....', '#....#....', '##..######', '.####..#.#', '.......#.#', '..........', '..........', '..........', '..........'] },
  { name: 'Anchor', rows: ['....##....', '...#..#...', '....##....', '..######..', '....##....', '....##....', '#...##...#', '##..##..##', '.########.', '...####...'] },
  { name: 'Mushroom', rows: ['...####...', '.##.##.##.', '##..##..##', '##########', '.#.####.#.', '...#..#...', '...#..#...', '...#..#...', '...####...', '..........'] },
  { name: 'Note', rows: ['....######', '....######', '....#....#', '....#....#', '....#....#', '....#....#', '.###.#.###', '####.#####', '####..####', '.##....##.'] },
];

export function clues(line: boolean[]): number[] {
  const out: number[] = [];
  let run = 0;
  for (const v of line) {
    if (v) run++;
    else if (run) {
      out.push(run);
      run = 0;
    }
  }
  if (run) out.push(run);
  return out.length ? out : [0];
}

type Mark = 0 | 1 | 2; // empty, filled, crossed

class Nonogram extends DomGame {
  private name = '';
  private solution: boolean[][] = [];
  private marks: Mark[][] = [];
  private mode: 1 | 2 = 1;
  private mistakes = 0;
  private shownSecond = -1;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    const p = pick(this.random, PICTURES);
    this.name = p.name;
    this.solution = p.rows.map((r) => [...r].map((ch) => ch === '#'));
    this.marks = this.solution.map((r) => r.map(() => 0 as Mark));
    this.mode = 1;
    this.mistakes = 0;
  }

  protected override onTick() {
    const s = Math.floor(this.elapsed);
    if (s !== this.shownSecond) {
      this.shownSecond = s;
      this.render();
    }
  }

  private solved() {
    // Any grid matching every row and column clue counts as solved.
    const filled = this.marks.map((r) => r.map((m) => m === 1));
    const cols = filled[0]!.map((_, c) => filled.map((r) => r[c]!));
    const solCols = this.solution[0]!.map((_, c) => this.solution.map((r) => r[c]!));
    return filled.every((r, i) => clues(r).join() === clues(this.solution[i]!).join()) && cols.every((c, i) => clues(c).join() === clues(solCols[i]!).join());
  }

  protected override onAction(action: string, value: string, event: Event) {
    if (action === 'mode') {
      this.mode = this.mode === 1 ? 2 : 1;
    } else if (action === 'cell') {
      const [r, c] = value.split(',').map(Number) as [number, number];
      const want: Mark = event.type === 'contextmenu' ? 2 : this.mode;
      this.marks[r]![c] = this.marks[r]![c] === want ? 0 : want;
      this.sfx.click();
      if (this.solved()) {
        this.setScore(1500 + Math.max(0, 600 - Math.floor(this.elapsed)) * 3);
        this.sfx.win();
        this.end('won', { seconds: Math.floor(this.elapsed) });
        return;
      }
    }
    this.render();
  }

  protected view() {
    const n = this.solution.length;
    const m = this.solution[0]!.length;
    const colClues = Array.from({ length: m }, (_, c) => clues(this.solution.map((r) => r[c]!)));
    const rowClues = this.solution.map((r) => clues(r));
    const head = `<div></div>${colClues.map((cl) => `<div style="display:flex;flex-direction:column;justify-content:flex-end;align-items:center;font-size:12px;font-weight:700;color:#a5b4fc;line-height:1.15">${cl.join('<br>')}</div>`).join('')}`;
    const body = this.marks
      .map((row, r) => {
        const cells = row
          .map((mk, c) => {
            const done = this.finished && this.solution[r]![c];
            const bg = mk === 1 || done ? '#a78bfa' : '#11183a';
            const border = `border-right:${c % 5 === 4 ? '2px' : '1px'} solid #3b4a8f;border-bottom:${r % 5 === 4 ? '2px' : '1px'} solid #3b4a8f`;
            return `<button type="button" class="pv-cell" style="border-radius:0;border:0;${border};background:${bg};color:#fb7185" data-action="cell" data-value="${r},${c}" aria-label="Row ${r + 1} column ${c + 1}: ${mk === 1 ? 'filled' : mk === 2 ? 'crossed' : 'empty'}">${mk === 2 ? '✕' : ''}</button>`;
          })
          .join('');
        return `<div style="display:flex;justify-content:flex-end;align-items:center;gap:4px;padding-right:6px;font-size:12px;font-weight:700;color:#a5b4fc">${rowClues[r]!.join(' ')}</div>${cells}`;
      })
      .join('');
    return `
      <div class="pv-hud"><span>Time <b>${formatTime(this.elapsed)}</b></span>${this.finished ? `<span>Picture: <b>${esc(this.name)}</b></span>` : ''}</div>
      <div style="display:grid;grid-template-columns:auto repeat(${m},minmax(0,1fr));width:min(100%,460px)">${head}${body}</div>
      <button type="button" class="pv-btn${this.mode === 2 ? '' : ' primary'}" data-action="mode" data-value="" aria-pressed="${this.mode === 2}">Mode: ${this.mode === 1 ? '■ Fill' : '✕ Cross'}</button>
      <p class="pv-muted">Numbers give the lengths of filled runs in each row and column, in order. Right-click marks a cross.</p>`;
  }
}

export default defineGame(
  { key: 'nonogram', engine: 'DOM', aspectRatio: 0.85, maxScore: 3_300, controls: [{ action: 'Fill / cross', keys: 'Click / right-click / Mode button' }] },
  (host) => new Nonogram(host),
);
