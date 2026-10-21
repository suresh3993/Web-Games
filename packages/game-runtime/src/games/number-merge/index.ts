import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { canMove, move, spawn, type Dir } from './logic';

const SIZE = 4;
const TILE_COLORS: Record<number, [string, string]> = {
  2: ['#1e2a66', '#e6e9f5'], 4: ['#25317a', '#e6e9f5'], 8: ['#6d4aff', '#fff'], 16: ['#7c3aed', '#fff'],
  32: ['#9333ea', '#fff'], 64: ['#c026d3', '#fff'], 128: ['#0891b2', '#fff'], 256: ['#0e7490', '#fff'],
  512: ['#059669', '#fff'], 1024: ['#d97706', '#fff'], 2048: ['#f59e0b', '#111'],
};

class NumberMerge extends DomGame {
  private board: number[] = [];
  private best = 0;
  private reached2048 = false;

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.board = spawn(spawn(Array(SIZE * SIZE).fill(0), this.random), this.random);
    this.best = 2;
    this.reached2048 = false;
  }

  private shift(dir: Dir) {
    const res = move(this.board, SIZE, dir);
    if (!res.moved) return;
    this.board = spawn(res.board, this.random);
    if (res.gained) {
      this.addScore(res.gained);
      this.sfx.beep(300 + Math.log2(res.gained) * 40, 0.05, 'triangle');
    }
    this.best = Math.max(...this.board);
    if (this.best >= 2048 && !this.reached2048) {
      this.reached2048 = true;
      this.sfx.win();
    }
    if (!canMove(this.board, SIZE)) {
      this.end(this.reached2048 ? 'won' : 'lost', { bestTile: this.best });
      return;
    }
    this.render();
  }

  protected override onKey(e: KeyboardEvent) {
    const map: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
    const dir = map[e.key];
    if (!dir) return false;
    this.shift(dir);
    return true;
  }

  protected override onSwipe(dir: Dir) {
    this.shift(dir);
  }

  protected override onAction(action: string, value: string) {
    if (action === 'dir') this.shift(value as Dir);
  }

  protected view() {
    const tiles = this.board
      .map((v) => {
        const [bg, fg] = TILE_COLORS[v] ?? (v ? ['#fbbf24', '#111'] : ['#11183a', '#fff']);
        const fs = v >= 1024 ? 'clamp(16px,4.5vmin,30px)' : 'clamp(20px,6vmin,40px)';
        return `<div class="pv-cell" style="background:${bg};color:${fg};font-size:${fs};${v >= 128 ? `box-shadow:0 0 18px ${bg}` : ''}" aria-label="${v || 'empty'}">${v || ''}</div>`;
      })
      .join('');
    const arrows = (['left', 'up', 'down', 'right'] as Dir[])
      .map((d) => `<button type="button" class="pv-btn" data-action="dir" data-value="${d}" aria-label="Move ${d}">${{ left: '←', up: '↑', down: '↓', right: '→' }[d]}</button>`)
      .join('');
    return `
      <div class="pv-hud"><span>Score <b>${this.score}</b></span><span>Best tile <b>${this.best}</b></span></div>
      <p class="pv-msg">${this.reached2048 ? '2048 reached! Keep going for a bigger tile.' : 'Merge equal tiles to reach 2048'}</p>
      <div class="pv-grid" style="--cols:${SIZE};--gap:10px;--w:420px;padding:10px;background:#0e1430;border-radius:14px;touch-action:none">${tiles}</div>
      <div class="pv-row">${arrows}</div>
      <p class="pv-muted">Arrow keys / WASD or swipe on the board.</p>`;
  }
}

export default defineGame(
  { key: 'number-merge', engine: 'DOM', aspectRatio: 0.85, maxScore: 4_000_000, controls: [{ action: 'Slide tiles', keys: 'Arrows / WASD / swipe' }] },
  (host) => new NumberMerge(host),
);
