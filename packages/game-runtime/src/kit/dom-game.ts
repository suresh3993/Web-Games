import type { GameHost, GameInstance, GameOutcome, Viewport } from '../interfaces/game-module';
import { Sfx } from './sfx';
import { ensureStyles } from './styles';

const TICK_MS = 100;

/**
 * Base class for DOM-rendered games (board, card, puzzle, word games).
 *
 *  - `view()` returns an HTML string (escape dynamic text with `esc`); it is
 *    re-rendered on `render()`.
 *  - Clicks on elements with `data-action` (and optional `data-value`) are routed
 *    to `onAction()`. Right-clicks arrive with `event.type === 'contextmenu'`.
 *  - Keyboard input goes to `onKey()`; return true to mark it handled.
 *  - `schedule()` / `onTick()` run on a virtual clock that stops while paused.
 */
export abstract class DomGame implements GameInstance {
  protected readonly root: HTMLDivElement;
  protected readonly sfx: Sfx;
  protected readonly random: () => number;
  protected score = 0;
  /** Seconds of active (unpaused) play in the current round. */
  protected elapsed = 0;
  protected finished = false;
  protected running = false;

  #started = false;
  #interval: ReturnType<typeof setInterval> | null = null;
  #lastTick = 0;
  #timers: { at: number; fn: () => void }[] = [];

  constructor(protected readonly host: GameHost) {
    ensureStyles();
    this.random = host.random;
    this.sfx = new Sfx(host);
    this.root = document.createElement('div');
    this.root.className = 'pv-game';
    host.container.appendChild(this.root);
    this.root.addEventListener('click', this.#onClick);
    this.root.addEventListener('contextmenu', this.#onClick);
    this.root.addEventListener('pointerdown', this.#onPointerDown);
    this.root.addEventListener('pointerup', this.#onPointerUp);
    window.addEventListener('keydown', this.#onKeyDown);
  }

  // ---- hooks -------------------------------------------------------------------------
  protected abstract reset(): void;
  protected abstract view(): string;
  protected onAction(_action: string, _value: string, _event: Event): void {}
  protected onKey(_event: KeyboardEvent): boolean {
    return false;
  }
  /** Called every ~100 ms of active play with the elapsed seconds since the last tick. */
  protected onTick(_dt: number): void {}
  /** Touch/mouse swipe across the game area (≥ 30 px). */
  protected onSwipe(_direction: 'up' | 'down' | 'left' | 'right'): void {}

  // ---- lifecycle ---------------------------------------------------------------------
  start() {
    this.#beginRound();
  }

  pause() {
    this.running = false;
    this.#stopClock();
    this.render();
  }

  resume() {
    if (this.finished) return;
    this.running = true;
    this.#startClock();
    this.render();
  }

  restart() {
    this.host.emit({ type: 'score', score: 0 });
    this.#beginRound();
  }

  finish() {
    if (!this.finished) this.end('quit');
  }

  resize(_viewport: Viewport) {}

  destroy() {
    this.running = false;
    this.#stopClock();
    this.#timers = [];
    this.root.removeEventListener('click', this.#onClick);
    this.root.removeEventListener('contextmenu', this.#onClick);
    this.root.removeEventListener('pointerdown', this.#onPointerDown);
    this.root.removeEventListener('pointerup', this.#onPointerUp);
    window.removeEventListener('keydown', this.#onKeyDown);
    this.sfx.close();
    this.root.remove();
  }

  // ---- helpers ------------------------------------------------------------------------
  /** Re-renders, keeping keyboard focus on the equivalent control. */
  protected render() {
    if (!this.#started) return;
    const active = document.activeElement as HTMLElement | null;
    const focusKey = active && this.root.contains(active) ? this.#keyOf(active) : null;
    this.root.innerHTML = this.view();
    if (focusKey) {
      const match = [...this.root.querySelectorAll<HTMLElement>('[data-action]')].find((el) => this.#keyOf(el) === focusKey);
      match?.focus({ preventScroll: true });
    }
  }

  protected addScore(points: number) {
    this.setScore(this.score + points);
  }

  protected setScore(value: number) {
    const next = Math.max(0, Math.floor(value));
    if (next === this.score) return;
    this.score = next;
    this.host.emit({ type: 'score', score: this.score });
  }

  /** Ends the round exactly once and renders the final state. */
  protected end(outcome: GameOutcome, stats: Record<string, number> = {}) {
    if (this.finished) return;
    this.finished = true;
    this.running = false;
    this.#stopClock();
    this.#timers = [];
    this.render();
    this.host.emit({ type: 'finished', result: { score: this.score, outcome, stats } });
  }

  /** Runs `fn` after `ms` of active play (respects pause; cleared on restart). */
  protected schedule(ms: number, fn: () => void) {
    this.#timers.push({ at: this.elapsed + ms / 1000, fn });
  }

  /** True when input should be accepted. */
  protected get live() {
    return this.running && !this.finished;
  }

  // ---- internals -----------------------------------------------------------------------
  #beginRound() {
    this.#stopClock();
    this.finished = false;
    this.score = 0;
    this.elapsed = 0;
    this.#timers = [];
    this.reset();
    this.#started = true;
    this.running = true;
    this.#startClock();
    this.render();
  }

  #startClock() {
    if (this.#interval !== null) return;
    this.#lastTick = performance.now();
    this.#interval = setInterval(() => {
      const now = performance.now();
      const dt = Math.min((now - this.#lastTick) / 1000, 0.5);
      this.#lastTick = now;
      if (!this.live) return;
      this.elapsed += dt;
      const due = this.#timers.filter((t) => t.at <= this.elapsed);
      if (due.length) {
        this.#timers = this.#timers.filter((t) => t.at > this.elapsed);
        for (const t of due) {
          if (!this.live) break;
          this.#guard(t.fn);
        }
      }
      if (this.live) this.#guard(() => this.onTick(dt));
    }, TICK_MS);
  }

  /**
   * Runs game code from an event or timer callback. A crash is reported to the host
   * (the player page shows it and offers a restart) instead of vanishing as an
   * uncaught browser error that leaves the game in an unknown state.
   */
  #guard<T>(fn: () => T): T | undefined {
    try {
      return fn();
    } catch (err) {
      this.host.emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      return undefined;
    }
  }

  #stopClock() {
    if (this.#interval !== null) clearInterval(this.#interval);
    this.#interval = null;
  }

  #keyOf(el: HTMLElement) {
    return el.dataset.action ? `${el.dataset.action}|${el.dataset.value ?? ''}` : null;
  }

  #swipeStart: { x: number; y: number } | null = null;

  #onPointerDown = (event: PointerEvent) => {
    this.#swipeStart = { x: event.clientX, y: event.clientY };
  };

  #onPointerUp = (event: PointerEvent) => {
    const start = this.#swipeStart;
    this.#swipeStart = null;
    if (!start || !this.live) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return;
    this.#guard(() => this.onSwipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'));
  };

  #onClick = (event: Event) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
    if (!target || !this.root.contains(target)) return;
    if (event.type === 'contextmenu') event.preventDefault();
    if (!this.live || (target as HTMLButtonElement).disabled) return;
    this.#guard(() => this.onAction(target.dataset.action!, target.dataset.value ?? '', event));
  };

  #onKeyDown = (event: KeyboardEvent) => {
    if (!this.live || event.ctrlKey || event.metaKey || event.altKey) return;
    const t = event.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    // Let Enter/Space activate a focused game button natively.
    if ((event.key === 'Enter' || event.key === ' ') && t instanceof HTMLElement && this.root.contains(t) && t.tagName === 'BUTTON') return;
    if (this.#guard(() => this.onKey(event))) event.preventDefault();
  };
}
