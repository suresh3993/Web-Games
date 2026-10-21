import type { GameHost, GameInstance, GameOutcome, Viewport } from '../interfaces/game-module';
import { Sfx } from './sfx';

const STEP = 1 / 60;
const PREVENT_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
const SWIPE_MIN = 24;

export type Swipe = 'up' | 'down' | 'left' | 'right';

/** Keyboard + pointer state in the game's logical coordinate space. */
export class Input {
  readonly held = new Set<string>();
  private pressed = new Set<string>();
  pointer = { x: 0, y: 0, down: false };
  /** Positions of pointer presses / releases since the last frame. */
  taps: { x: number; y: number }[] = [];
  releases: { x: number; y: number }[] = [];
  swipe: Swipe | null = null;
  private start: { x: number; y: number; cx: number; cy: number } | null = null;

  key(code: string) {
    return this.held.has(code);
  }
  /** True only in the frame the key went down. */
  hit(code: string) {
    return this.pressed.has(code);
  }
  /** Any of the codes held. */
  any(...codes: string[]) {
    return codes.some((c) => this.held.has(c));
  }
  anyHit(...codes: string[]) {
    return codes.some((c) => this.pressed.has(c));
  }
  /** One-button games: space / enter / tap. */
  action() {
    return this.anyHit('Space', 'Enter', 'ArrowUp', 'KeyW') || this.taps.length > 0;
  }
  get left() {
    return this.any('ArrowLeft', 'KeyA');
  }
  get right() {
    return this.any('ArrowRight', 'KeyD');
  }
  get up() {
    return this.any('ArrowUp', 'KeyW');
  }
  get down() {
    return this.any('ArrowDown', 'KeyS');
  }

  onKeyDown(code: string) {
    if (!this.held.has(code)) this.pressed.add(code);
    this.held.add(code);
  }
  onKeyUp(code: string) {
    this.held.delete(code);
  }
  onPointerDown(x: number, y: number, cx: number, cy: number) {
    this.pointer = { x, y, down: true };
    this.taps.push({ x, y });
    this.start = { x, y, cx, cy };
  }
  onPointerMove(x: number, y: number) {
    this.pointer.x = x;
    this.pointer.y = y;
  }
  onPointerUp(x: number, y: number, cx: number, cy: number) {
    this.pointer = { x, y, down: false };
    this.releases.push({ x, y });
    if (this.start) {
      const dx = cx - this.start.cx;
      const dy = cy - this.start.cy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) >= SWIPE_MIN) {
        this.swipe = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      }
    }
    this.start = null;
  }
  endFrame() {
    this.pressed.clear();
    this.taps = [];
    this.releases = [];
    this.swipe = null;
  }
  reset() {
    this.held.clear();
    this.endFrame();
    this.pointer.down = false;
  }
}

export interface CanvasGameOptions {
  /** Logical resolution; the canvas is letterboxed to fit the container. */
  width: number;
  height: number;
  background?: string;
}

/**
 * Base class for real-time canvas games: fixed 60 Hz update loop, letterboxed
 * rendering in logical coordinates, unified keyboard/pointer/swipe input and the
 * full GameInstance lifecycle. Subclasses implement reset(), update() and draw().
 *
 * Note: subclass field initialisers run *after* this constructor, so the base
 * never calls subclass hooks before start().
 */
export abstract class CanvasGame implements GameInstance {
  protected readonly W: number;
  protected readonly H: number;
  protected readonly input = new Input();
  protected readonly sfx: Sfx;
  protected readonly random: () => number;
  protected score = 0;
  /** Seconds of active play in the current round. */
  protected time = 0;
  protected finished = false;

  readonly #canvas: HTMLCanvasElement;
  readonly #ctx: CanvasRenderingContext2D | null;
  readonly #background: string;
  #running = false;
  #started = false;
  #frame: number | null = null;
  #last: number | null = null;
  #acc = 0;
  #scale = 1;
  #offX = 0;
  #offY = 0;
  #dpr = 1;
  #timers: { at: number; fn: () => void }[] = [];

  constructor(
    protected readonly host: GameHost,
    options: CanvasGameOptions,
  ) {
    this.W = options.width;
    this.H = options.height;
    this.#background = options.background ?? '#0b1022';
    this.random = host.random;
    this.sfx = new Sfx(host);
    this.#canvas = document.createElement('canvas');
    this.#canvas.tabIndex = 0;
    this.#canvas.setAttribute('role', 'application');
    this.#canvas.setAttribute('aria-label', 'Game canvas');
    this.#canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none;';
    host.container.appendChild(this.#canvas);
    this.#ctx = this.#canvas.getContext('2d');

    window.addEventListener('keydown', this.#onKeyDown);
    window.addEventListener('keyup', this.#onKeyUp);
    window.addEventListener('blur', this.#onBlur);
    this.#canvas.addEventListener('pointerdown', this.#onPointerDown);
    this.#canvas.addEventListener('pointermove', this.#onPointerMove);
    this.#canvas.addEventListener('pointerup', this.#onPointerUp);
    this.#canvas.addEventListener('pointercancel', this.#onPointerUp);
    this.#canvas.addEventListener('contextmenu', this.#onContextMenu);
    this.#applyViewport(host.viewport);
  }

  // ---- hooks -------------------------------------------------------------------
  protected abstract reset(): void;
  protected abstract update(dt: number): void;
  protected abstract draw(ctx: CanvasRenderingContext2D): void;

  // ---- lifecycle -----------------------------------------------------------------
  start() {
    this.#beginRound();
    this.#canvas.focus({ preventScroll: true });
  }

  pause() {
    this.#running = false;
    this.#stopLoop();
    this.input.reset();
    this.#render();
  }

  resume() {
    if (this.finished) return;
    this.#running = true;
    this.#loop();
  }

  restart() {
    this.#stopLoop();
    this.host.emit({ type: 'score', score: 0 });
    this.#beginRound();
  }

  finish() {
    if (!this.finished) this.end('quit');
  }

  resize(viewport: Viewport) {
    this.#applyViewport(viewport);
    if (this.#started) this.#render();
  }

  destroy() {
    this.#running = false;
    this.#stopLoop();
    window.removeEventListener('keydown', this.#onKeyDown);
    window.removeEventListener('keyup', this.#onKeyUp);
    window.removeEventListener('blur', this.#onBlur);
    this.#canvas.removeEventListener('pointerdown', this.#onPointerDown);
    this.#canvas.removeEventListener('pointermove', this.#onPointerMove);
    this.#canvas.removeEventListener('pointerup', this.#onPointerUp);
    this.#canvas.removeEventListener('pointercancel', this.#onPointerUp);
    this.#canvas.removeEventListener('contextmenu', this.#onContextMenu);
    this.sfx.close();
    this.#canvas.remove();
  }

  // ---- helpers for subclasses -----------------------------------------------------
  protected addScore(points: number) {
    this.setScore(this.score + points);
  }

  protected setScore(value: number) {
    const next = Math.max(0, Math.floor(value));
    if (next === this.score) return;
    this.score = next;
    this.host.emit({ type: 'score', score: this.score });
  }

  /** Ends the round exactly once. */
  protected end(outcome: GameOutcome, stats: Record<string, number> = {}) {
    if (this.finished) return;
    this.finished = true;
    this.#running = false;
    this.#stopLoop();
    this.#render();
    this.host.emit({ type: 'finished', result: { score: this.score, outcome, stats } });
  }

  /** Runs `fn` after `seconds` of active game time (pauses are respected). */
  protected after(seconds: number, fn: () => void) {
    this.#timers.push({ at: this.time + seconds, fn });
  }

  protected get reducedMotion() {
    return this.host.settings.reducedMotion;
  }

  protected text(
    ctx: CanvasRenderingContext2D,
    value: string,
    x: number,
    y: number,
    opts: { size?: number; color?: string; align?: CanvasTextAlign; weight?: number; font?: 'display' | 'body'; baseline?: CanvasTextBaseline } = {},
  ) {
    const family = opts.font === 'body' ? "'Inter Variable', system-ui, sans-serif" : "'Space Grotesk Variable', 'Inter Variable', system-ui, sans-serif";
    ctx.font = `${opts.weight ?? 700} ${opts.size ?? 16}px ${family}`;
    ctx.fillStyle = opts.color ?? '#e6e9f5';
    ctx.textAlign = opts.align ?? 'left';
    ctx.textBaseline = opts.baseline ?? 'alphabetic';
    ctx.fillText(value, x, y);
  }

  protected roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  protected circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
    ctx.fill();
  }

  /** Neon glow (disabled with reduced motion to keep rendering cheap and calm). */
  protected glow(ctx: CanvasRenderingContext2D, color: string, blur = 12) {
    ctx.shadowColor = color;
    ctx.shadowBlur = this.reducedMotion ? 0 : blur;
  }

  protected noGlow(ctx: CanvasRenderingContext2D) {
    ctx.shadowBlur = 0;
  }

  /** True if any tap this frame landed inside the rectangle (immediate-mode UI). */
  protected tapped(rect: { x: number; y: number; w: number; h: number }) {
    return this.input.taps.some((t) => t.x >= rect.x && t.x <= rect.x + rect.w && t.y >= rect.y && t.y <= rect.y + rect.h);
  }

  /** Draws a tappable button (pair with `tapped(rect)` in update()). */
  protected button(ctx: CanvasRenderingContext2D, rect: { x: number; y: number; w: number; h: number }, label: string, active = false) {
    this.roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 10, active ? '#6d4aff' : '#141b3a');
    ctx.strokeStyle = active ? '#a78bfa' : 'rgba(148,163,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
    this.text(ctx, label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 6, { size: 16, align: 'center' });
  }

  /** Standard HUD line at the top of the screen. */
  protected hud(ctx: CanvasRenderingContext2D, left: string, right?: string) {
    this.text(ctx, left, 12, 24, { size: 16, color: '#e6e9f5' });
    if (right) this.text(ctx, right, this.W - 12, 24, { size: 16, color: '#9aa0c0', align: 'right' });
  }

  // ---- internals ---------------------------------------------------------------------
  #beginRound() {
    this.finished = false;
    this.score = 0;
    this.time = 0;
    this.#acc = 0;
    this.#timers = [];
    this.input.reset();
    this.reset();
    this.#started = true;
    this.#running = true;
    this.#render();
    this.#loop();
  }

  #loop() {
    if (this.#frame !== null) return;
    this.#frame = requestAnimationFrame((now) => {
      this.#frame = null;
      if (!this.#running) return;
      if (this.#last !== null) this.#acc += Math.min((now - this.#last) / 1000, 0.25);
      this.#last = now;
      try {
        let steps = 0;
        while (this.#acc >= STEP && this.#running && steps < 8) {
          this.#acc -= STEP;
          steps++;
          this.time += STEP;
          this.#runTimers();
          if (!this.#running) break;
          this.update(STEP);
          this.input.endFrame();
        }
        this.#render();
      } catch (err) {
        // Halt (the frame left the game in an unknown state) and tell the host, so the player
        // sees an error with End round / Restart instead of a silently frozen canvas.
        this.#running = false;
        this.host.emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
        return;
      }
      if (this.#running) this.#loop();
    });
  }

  #runTimers() {
    if (!this.#timers.length) return;
    const due = this.#timers.filter((t) => t.at <= this.time);
    if (!due.length) return;
    this.#timers = this.#timers.filter((t) => t.at > this.time);
    for (const t of due) t.fn();
  }

  #stopLoop() {
    if (this.#frame !== null) cancelAnimationFrame(this.#frame);
    this.#frame = null;
    this.#last = null;
  }

  #render() {
    const ctx = this.#ctx;
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#05070f';
    ctx.fillRect(0, 0, this.#canvas.width, this.#canvas.height);
    const s = this.#scale * this.#dpr;
    ctx.setTransform(s, 0, 0, s, this.#offX * this.#dpr, this.#offY * this.#dpr);
    ctx.fillStyle = this.#background;
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, this.W, this.H);
    ctx.clip();
    if (this.#started) this.draw(ctx);
    ctx.restore();
  }

  #applyViewport(viewport: Viewport) {
    this.#dpr = Math.min(viewport.devicePixelRatio || 1, 2);
    const w = Math.max(1, viewport.width);
    const h = Math.max(1, viewport.height);
    this.#canvas.width = Math.floor(w * this.#dpr);
    this.#canvas.height = Math.floor(h * this.#dpr);
    this.#scale = Math.min(w / this.W, h / this.H);
    this.#offX = (w - this.W * this.#scale) / 2;
    this.#offY = (h - this.H * this.#scale) / 2;
  }

  #toLogical(e: PointerEvent) {
    const rect = this.#canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    return { x: (px - this.#offX) / this.#scale, y: (py - this.#offY) / this.#scale };
  }

  #typingTarget(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  #onKeyDown = (e: KeyboardEvent) => {
    if (!this.#running || this.#typingTarget(e)) return;
    if (PREVENT_KEYS.has(e.code)) e.preventDefault();
    this.input.onKeyDown(e.code);
  };

  #onKeyUp = (e: KeyboardEvent) => this.input.onKeyUp(e.code);

  #onBlur = () => this.input.reset();

  #onPointerDown = (e: PointerEvent) => {
    if (!this.#running) return;
    e.preventDefault();
    this.#canvas.focus({ preventScroll: true });
    try {
      this.#canvas.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic events in tests have no active pointer.
    }
    const p = this.#toLogical(e);
    this.input.onPointerDown(p.x, p.y, e.clientX, e.clientY);
  };

  #onPointerMove = (e: PointerEvent) => {
    const p = this.#toLogical(e);
    this.input.onPointerMove(p.x, p.y);
  };

  #onPointerUp = (e: PointerEvent) => {
    const p = this.#toLogical(e);
    this.input.onPointerUp(p.x, p.y, e.clientX, e.clientY);
  };

  #onContextMenu = (e: Event) => e.preventDefault();
}
