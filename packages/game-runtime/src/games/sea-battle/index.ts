import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { opponentBar, type Opponent } from '../../kit/versus';

const N = 10;
const SHIPS = [5, 4, 3, 3, 2];

interface Board {
  ships: number[][]; // cell indices per ship
  shots: Set<number>;
}

export function placeFleet(random: () => number): number[][] {
  for (;;) {
    const taken = new Set<number>();
    const ships: number[][] = [];
    let ok = true;
    for (const len of SHIPS) {
      let placed = false;
      for (let attempt = 0; attempt < 200 && !placed; attempt++) {
        const horizontal = random() < 0.5;
        const r = Math.floor(random() * (horizontal ? N : N - len + 1));
        const c = Math.floor(random() * (horizontal ? N - len + 1 : N));
        const cells = Array.from({ length: len }, (_, k) => (horizontal ? r * N + c + k : (r + k) * N + c));
        // Ships may not touch (including diagonally).
        const blocked = cells.some((i) => {
          const rr = Math.floor(i / N);
          const cc = i % N;
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (taken.has((rr + dr) * N + cc + dc) && rr + dr >= 0 && cc + dc >= 0 && rr + dr < N && cc + dc < N) return true;
          return false;
        });
        if (blocked) continue;
        cells.forEach((i) => taken.add(i));
        ships.push(cells);
        placed = true;
      }
      if (!placed) ok = false;
    }
    if (ok) return ships;
  }
}

const sunk = (b: Board, ship: number[]) => ship.every((i) => b.shots.has(i));
const allSunk = (b: Board) => b.ships.every((s) => sunk(b, s));
const isHit = (b: Board, i: number) => b.ships.some((s) => s.includes(i));

class SeaBattle extends DomGame {
  private opponent: Opponent = 'medium';
  private boards: Board[] = [];
  private turn = 0;
  private phase: 'setup' | 'play' | 'handoff' = 'setup';
  private message = '';
  private shotsFired = 0;
  private hunt: number[] = [];

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.boards = [0, 1].map(() => ({ ships: placeFleet(this.random), shots: new Set<number>() }));
    this.turn = 0;
    this.phase = 'setup';
    this.shotsFired = 0;
    this.hunt = [];
    this.message = 'Your fleet is placed. Shuffle it if you like, then start firing.';
  }

  /** CPU: hunt mode (parity pattern) and target mode around hits. */
  private cpuFire() {
    const b = this.boards[0]!;
    const open = (i: number) => i >= 0 && i < N * N && !b.shots.has(i);
    let target = -1;
    while (this.hunt.length && target < 0) {
      const t = this.hunt.pop()!;
      if (open(t)) target = t;
    }
    if (target < 0) {
      const level = this.opponent === 'easy' ? 0 : 1;
      const candidates = [...Array(N * N).keys()].filter((i) => open(i) && (level === 0 || (Math.floor(i / N) + (i % N)) % 2 === 0));
      const pool = candidates.length ? candidates : [...Array(N * N).keys()].filter(open);
      target = pool[Math.floor(this.random() * pool.length)]!;
    }
    b.shots.add(target);
    if (isHit(b, target) && this.opponent !== 'easy') {
      const r = Math.floor(target / N);
      const c = target % N;
      if (c > 0) this.hunt.push(target - 1);
      if (c < N - 1) this.hunt.push(target + 1);
      if (r > 0) this.hunt.push(target - N);
      if (r < N - 1) this.hunt.push(target + N);
    }
    this.message = isHit(b, target) ? 'The enemy hit your ship!' : 'The enemy missed.';
    if (allSunk(b)) {
      this.message = 'Your fleet was sunk.';
      this.end('lost', { shots: this.shotsFired });
      return;
    }
    this.turn = 0;
    this.render();
  }

  private fire(i: number) {
    const enemy = this.boards[this.turn === 0 ? 1 : 0]!;
    if (enemy.shots.has(i)) return;
    enemy.shots.add(i);
    if (this.turn === 0) this.shotsFired++;
    const hit = isHit(enemy, i);
    const ship = enemy.ships.find((s) => s.includes(i));
    this.sfx[hit ? 'good' : 'click']();
    this.message = hit ? (ship && sunk(enemy, ship) ? `Hit — ship sunk! (${ship.length})` : 'Hit!') : 'Miss.';
    if (allSunk(enemy)) {
      if (this.opponent === '2p') {
        this.message = `Player ${this.turn + 1} sinks the whole fleet and wins!`;
        this.end('completed');
      } else {
        const mult = { easy: 1, medium: 2, hard: 3 }[this.opponent];
        this.setScore((300 + Math.max(0, 100 - this.shotsFired) * 10) * mult);
        this.sfx.win();
        this.end('won', { shots: this.shotsFired });
      }
      return;
    }
    if (this.opponent === '2p') {
      this.phase = 'handoff';
      this.turn = this.turn === 0 ? 1 : 0;
    } else {
      this.turn = 1;
      this.schedule(700, () => this.cpuFire());
    }
    this.render();
  }

  protected override onAction(action: string, value: string) {
    if (action === 'opponent' && this.phase === 'setup') {
      this.opponent = value as Opponent;
      this.reset();
    } else if (action === 'shuffle' && this.phase === 'setup') {
      this.boards[0]!.ships = placeFleet(this.random);
    } else if (action === 'start' && this.phase === 'setup') {
      this.phase = this.opponent === '2p' ? 'handoff' : 'play';
      this.message = 'Fire at the enemy waters.';
    } else if (action === 'ready' && this.phase === 'handoff') {
      this.phase = 'play';
      this.message = `Player ${this.turn + 1}: fire!`;
    } else if (action === 'cell' && this.phase === 'play' && (this.opponent === '2p' || this.turn === 0)) {
      return this.fire(Number(value));
    }
    this.render();
  }

  private grid(b: Board, revealShips: boolean, clickable: boolean) {
    const cells = Array.from({ length: N * N }, (_, i) => {
      const shot = b.shots.has(i);
      const ship = b.ships.find((s) => s.includes(i));
      const isSunk = ship && sunk(b, ship);
      const bg = shot ? (ship ? (isSunk ? '#7f1d1d' : '#dc2626') : '#1e3a8a') : ship && revealShips ? '#64748b' : '#0c4a6e';
      const mark = shot ? (ship ? '✸' : '•') : '';
      return clickable && !shot
        ? `<button type="button" class="pv-cell" style="border-radius:2px;background:${bg}" data-action="cell" data-value="${i}" aria-label="${String.fromCharCode(65 + Math.floor(i / N))}${(i % N) + 1}"></button>`
        : `<div class="pv-cell" style="border-radius:2px;background:${bg};font-size:14px">${mark}</div>`;
    }).join('');
    return `<div class="pv-grid" style="--cols:${N};--gap:2px;--w:360px">${cells}</div>`;
  }

  protected view() {
    if (this.phase === 'handoff') {
      return `<div class="pv-col" style="margin:auto"><p class="pv-big">Pass the device to Player ${this.turn + 1}</p><p class="pv-muted">No peeking at the other fleet!</p><button type="button" class="pv-btn primary" data-action="ready" data-value="">I'm Player ${this.turn + 1} — ready</button></div>`;
    }
    const me = this.opponent === '2p' ? this.turn : 0;
    const enemy = me === 0 ? 1 : 0;
    const setup = this.phase === 'setup'
      ? `<div class="pv-row"><button type="button" class="pv-btn" data-action="shuffle" data-value="">⤨ Shuffle my fleet</button><button type="button" class="pv-btn primary" data-action="start" data-value="">Start battle</button></div>`
      : '';
    const left = (b: Board) => b.ships.filter((s) => !sunk(b, s)).length;
    return `
      ${opponentBar(this.opponent, this.phase !== 'setup')}
      <p class="pv-msg" role="status">${this.message}</p>
      ${setup}
      <div class="pv-row" style="align-items:flex-start;gap:20px">
        <div class="pv-col"><b>Enemy waters</b> <span class="pv-muted">${left(this.boards[enemy]!)} ships afloat</span>${this.grid(this.boards[enemy]!, this.finished, this.phase === 'play' && (this.opponent === '2p' || this.turn === 0))}</div>
        <div class="pv-col"><b>${this.opponent === '2p' ? `Player ${me + 1}'s fleet` : 'Your fleet'}</b> <span class="pv-muted">${left(this.boards[me]!)} ships afloat</span>${this.grid(this.boards[me]!, true, false)}</div>
      </div>`;
  }
}

export default defineGame(
  { key: 'sea-battle', engine: 'DOM', aspectRatio: 1.5, maxScore: 3 * 1300, controls: [{ action: 'Fire', keys: 'Click an enemy cell' }] },
  (host) => new SeaBattle(host),
);
