import type { GameHost, GameInstance, GameModule, Viewport } from '../../interfaces/game-module';
import { createSnakeState, POINTS_PER_FOOD, queueDirection, tick, tickInterval, type Direction, type SnakeState } from './logic';

const COLS = 24;
const ROWS = 16;
const KEY_MAP: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
};
const SWIPE_THRESHOLD_PX = 24;

const COLORS = {
  board: '#0b1022',
  grid: 'rgba(124, 92, 255, 0.07)',
  head: '#22d3ee',
  body: '#7c5cff',
  food: '#f472b6',
};

class SnakeGame implements GameInstance {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private state: SnakeState;
  private frame: number | null = null;
  private lastTime: number | null = null;
  private accumulator = 0;
  private running = false;
  private finished = false;
  private touchStart: { x: number; y: number } | null = null;
  private audio: AudioContext | null = null;

  constructor(private host: GameHost) {
    this.canvas = document.createElement('canvas');
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'Snake game board. Use arrow keys or swipe to steer.');
    this.canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none;';
    host.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.state = createSnakeState(COLS, ROWS, host.random);

    window.addEventListener('keydown', this.onKeyDown);
    this.canvas.addEventListener('touchstart', this.onTouchStart, { passive: true });
    this.canvas.addEventListener('touchend', this.onTouchEnd);
    this.resize(host.viewport);
  }

  start() {
    this.running = true;
    this.canvas.focus({ preventScroll: true });
    this.loop();
  }

  pause() {
    this.running = false;
    this.stopLoop();
    this.draw();
  }

  resume() {
    this.running = true;
    this.loop();
  }

  restart() {
    this.stopLoop();
    this.state = createSnakeState(COLS, ROWS, this.host.random);
    this.finished = false;
    this.accumulator = 0;
    this.host.emit({ type: 'score', score: 0 });
    this.start();
  }

  finish() {
    if (this.finished) return;
    this.endRound('quit');
  }

  resize(viewport: Viewport) {
    const dpr = Math.min(viewport.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
    this.draw();
  }

  destroy() {
    this.stopLoop();
    this.running = false;
    window.removeEventListener('keydown', this.onKeyDown);
    this.canvas.removeEventListener('touchstart', this.onTouchStart);
    this.canvas.removeEventListener('touchend', this.onTouchEnd);
    void this.audio?.close();
    this.canvas.remove();
  }

  private loop = () => {
    this.frame = requestAnimationFrame((time) => {
      if (!this.running) return;
      if (this.lastTime !== null) this.accumulator += Math.min(time - this.lastTime, 250);
      this.lastTime = time;
      const interval = tickInterval(this.state.foodEaten);
      while (this.accumulator >= interval && this.state.alive) {
        this.accumulator -= interval;
        this.step();
      }
      this.draw();
      if (this.running) this.loop();
    });
  };

  private stopLoop() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.lastTime = null;
  }

  private step() {
    const before = this.state.score;
    this.state = tick(this.state, this.host.random);
    if (this.state.score !== before) {
      this.beep(660, 0.06);
      this.host.emit({ type: 'score', score: this.state.score });
    }
    if (!this.state.alive) {
      this.beep(this.state.won ? 880 : 140, 0.25);
      this.endRound(this.state.won ? 'won' : 'lost');
    }
  }

  private endRound(outcome: 'won' | 'lost' | 'quit') {
    this.finished = true;
    this.running = false;
    this.stopLoop();
    this.draw();
    this.host.emit({
      type: 'finished',
      result: {
        score: this.state.score,
        outcome,
        stats: { foodEaten: this.state.foodEaten, length: this.state.snake.length, ticks: this.state.ticks },
      },
    });
  }

  private turn(direction: Direction) {
    if (this.running) this.state = queueDirection(this.state, direction);
  }

  private onKeyDown = (event: KeyboardEvent) => {
    const direction = KEY_MAP[event.code];
    if (!direction || !this.running) return;
    event.preventDefault();
    this.turn(direction);
  };

  private onTouchStart = (event: TouchEvent) => {
    const t = event.changedTouches[0];
    if (t) this.touchStart = { x: t.clientX, y: t.clientY };
  };

  private onTouchEnd = (event: TouchEvent) => {
    const t = event.changedTouches[0];
    if (!t || !this.touchStart) return;
    const dx = t.clientX - this.touchStart.x;
    const dy = t.clientY - this.touchStart.y;
    this.touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD_PX) return;
    event.preventDefault();
    this.turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  };

  private beep(frequency: number, seconds: number) {
    if (!this.host.settings.soundEnabled || typeof AudioContext === 'undefined') return;
    try {
      this.audio ??= new AudioContext();
      const osc = this.audio.createOscillator();
      const gain = this.audio.createGain();
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.08, this.audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.audio.currentTime + seconds);
      osc.connect(gain).connect(this.audio.destination);
      osc.start();
      osc.stop(this.audio.currentTime + seconds);
    } catch {
      // Audio is optional; ignore autoplay or device errors.
    }
  }

  private draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    const { width, height } = this.canvas;
    const cell = Math.floor(Math.min(width / COLS, height / ROWS));
    const ox = Math.floor((width - cell * COLS) / 2);
    const oy = Math.floor((height - cell * ROWS) / 2);

    ctx.fillStyle = COLORS.board;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(ox + x * cell + 0.5, oy);
      ctx.lineTo(ox + x * cell + 0.5, oy + ROWS * cell);
      ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(ox, oy + y * cell + 0.5);
      ctx.lineTo(ox + COLS * cell, oy + y * cell + 0.5);
      ctx.stroke();
    }

    const glow = this.host.settings.reducedMotion ? 0 : cell * 0.6;
    if (this.state.food) {
      ctx.shadowBlur = glow;
      ctx.shadowColor = COLORS.food;
      ctx.fillStyle = COLORS.food;
      ctx.beginPath();
      ctx.arc(ox + (this.state.food.x + 0.5) * cell, oy + (this.state.food.y + 0.5) * cell, cell * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
    this.state.snake.forEach((p, i) => {
      ctx.shadowBlur = i === 0 ? glow : 0;
      ctx.shadowColor = COLORS.head;
      ctx.fillStyle = i === 0 ? COLORS.head : COLORS.body;
      const inset = Math.max(1, Math.floor(cell * 0.08));
      ctx.fillRect(ox + p.x * cell + inset, oy + p.y * cell + inset, cell - inset * 2, cell - inset * 2);
    });
    ctx.shadowBlur = 0;
  }
}

export const snakeGame: GameModule = {
  manifest: {
    key: 'snake',
    version: '1.0.0',
    engine: 'CANVAS',
    input: { keyboard: true, touch: true, pointer: false },
    supportsPause: true,
    supportsSound: true,
    orientation: 'landscape',
    aspectRatio: COLS / ROWS,
    scoring: {
      kind: 'points',
      order: 'higher-is-better',
      label: 'Points',
      maxScore: (COLS * ROWS - 3) * POINTS_PER_FOOD,
    },
    controls: [
      { action: 'Steer', keys: 'Arrow keys / WASD / swipe' },
      { action: 'Pause', keys: 'Player pause button' },
    ],
  },
  create: (host) => new SnakeGame(host),
};
