import type { GameHost } from '../../interfaces/game-module';
import { defineGame } from '../../kit/define';
import { DomGame } from '../../kit/dom-game';
import { generateLevel, solved, step, type Level } from './logic';

const LEVELS = 5;

class CratePusher extends DomGame {
  private levelNo = 1;
  private level!: Level;
  private crates: number[] = [];
  private player = 0;
  private pushes = 0;
  private history: { crates: number[]; player: number; pushes: number }[] = [];

  constructor(host: GameHost) {
    super(host);
  }

  protected reset() {
    this.levelNo = 1;
    this.load();
  }

  private load() {
    this.level = generateLevel(this.random, Math.min(4, 1 + Math.ceil(this.levelNo / 2)), 8 + Math.min(3, this.levelNo), 7 + Math.min(2, Math.floor(this.levelNo / 2)));
    this.crates = [...this.level.crates];
    this.player = this.level.player;
    this.pushes = 0;
    this.history = [];
  }

  private move(dx: number, dy: number) {
    const res = step(this.level, this.crates, this.player, dy * this.level.w + dx);
    if (!res) return;
    this.history.push({ crates: this.crates, player: this.player, pushes: this.pushes });
    this.crates = res.crates;
    this.player = res.player;
    if (res.pushed) {
      this.pushes++;
      this.sfx.click();
    }
    if (solved(this.level, this.crates)) {
      this.addScore(300 * this.levelNo + Math.max(0, 120 - this.pushes) * 2);
      this.sfx.win();
      if (this.levelNo >= LEVELS) {
        this.end('won', { levels: LEVELS });
        return;
      }
      this.levelNo++;
      this.load();
    }
    this.render();
  }

  protected override onKey(e: KeyboardEvent) {
    const map: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
    const m = map[e.key];
    if (m) {
      this.move(m[0], m[1]);
      return true;
    }
    if (e.key.toLowerCase() === 'u' || e.key === 'z') {
      this.onAction('undo', '');
      return true;
    }
    return false;
  }

  protected override onSwipe(dir: 'up' | 'down' | 'left' | 'right') {
    const m = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir] as [number, number];
    this.move(m[0], m[1]);
  }

  protected override onAction(action: string, value: string) {
    if (action === 'move') {
      const [dx, dy] = value.split(',').map(Number) as [number, number];
      this.move(dx, dy);
      return;
    }
    if (action === 'undo' && this.history.length) {
      const h = this.history.pop()!;
      this.crates = h.crates;
      this.player = h.player;
      this.pushes = h.pushes;
    } else if (action === 'retry') {
      this.crates = [...this.level.crates];
      this.player = this.level.player;
      this.pushes = 0;
      this.history = [];
    }
    this.render();
  }

  protected view() {
    const L = this.level;
    const cells = L.walls
      .map((wall, i) => {
        const goal = L.goals.includes(i);
        const crate = this.crates.includes(i);
        let content = '';
        let bg = wall ? '#3b4a8f' : '#0e1430';
        if (goal) content = '<span style="width:34%;height:34%;border-radius:50%;border:3px solid #4ade80"></span>';
        if (crate) {
          bg = goal ? '#15803d' : '#b45309';
          content = '<span style="font-size:clamp(14px,3.6vmin,26px)">▣</span>';
        }
        if (i === this.player) content = '<span style="width:64%;height:64%;border-radius:50%;background:#22d3ee;box-shadow:0 0 10px #22d3ee"></span>';
        return `<div class="pv-cell" style="border-radius:${wall ? '3px' : '0'};border:0;background:${bg}">${content}</div>`;
      })
      .join('');
    const pad = `<div class="pv-grid" style="--cols:3;--gap:6px;--w:170px">
      <span></span><button type="button" class="pv-btn" data-action="move" data-value="0,-1" aria-label="Up">↑</button><span></span>
      <button type="button" class="pv-btn" data-action="move" data-value="-1,0" aria-label="Left">←</button><button type="button" class="pv-btn" data-action="move" data-value="0,1" aria-label="Down">↓</button><button type="button" class="pv-btn" data-action="move" data-value="1,0" aria-label="Right">→</button></div>`;
    return `
      <div class="pv-hud"><span>Level <b>${this.levelNo}/${LEVELS}</b></span><span>Pushes <b>${this.pushes}</b></span><span>Score <b>${this.score}</b></span></div>
      <div class="pv-grid" style="--cols:${L.w};--gap:1px;--w:${L.w * 50}px">${cells}</div>
      <div class="pv-row">${pad}
        <div class="pv-col"><button type="button" class="pv-btn small" data-action="undo" data-value="" ${this.history.length ? '' : 'disabled'}>↶ Undo</button>
        <button type="button" class="pv-btn small" data-action="retry" data-value="">⟲ Restart level</button></div></div>
      <p class="pv-muted">Push every crate onto a green target. You can push, never pull. Arrows/WASD, swipe or the pad.</p>`;
  }
}

export default defineGame(
  { key: 'crate-pusher', engine: 'DOM', aspectRatio: 0.85, maxScore: 300 * 15 + 240 * 5, controls: [{ action: 'Move / push', keys: 'Arrows / WASD / swipe' }, { action: 'Undo', keys: 'U / Z' }] },
  (host) => new CratePusher(host),
);
