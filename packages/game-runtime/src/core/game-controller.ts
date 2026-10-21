import type {
  GameEvent,
  GameInstance,
  GameLifecycleState,
  GameModule,
  GameResult,
  GameSettings,
  Viewport,
} from '../interfaces/game-module';
import { createRng, createSeed } from './random';

export interface FinishedRound extends GameResult {
  /** Active play time measured by the host (paused time excluded). */
  durationMs: number;
  seed: string;
}

export type ControllerEvent =
  | { type: 'state'; state: GameLifecycleState }
  | { type: 'score'; score: number }
  | { type: 'finished'; round: FinishedRound }
  | { type: 'error'; message: string };

export interface GameControllerOptions {
  container: HTMLElement;
  viewport: Viewport;
  settings: GameSettings;
  /** Fixed seed (tests / replays). A fresh random seed is used per round otherwise. */
  seed?: string;
  /** Pass `document` to auto-pause when the tab is hidden. */
  visibilityTarget?: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'> | null;
  now?: () => number;
}

type Listener = (event: ControllerEvent) => void;

const sanitizeScore = (score: unknown): number =>
  typeof score === 'number' && Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;

/**
 * Owns a single `GameInstance` and enforces the lifecycle state machine so that
 * games cannot be started twice, resumed while finished, etc. The player UI talks
 * only to the controller, never to the instance directly.
 */
export class GameController {
  private instance: GameInstance;
  private _state: GameLifecycleState = 'idle';
  private _score = 0;
  private listeners = new Set<Listener>();
  private activeMs = 0;
  private runningSince: number | null = null;
  private seed: string;
  private readonly fixedSeed: string | undefined;
  private rng: () => number;
  private readonly now: () => number;
  private readonly visibilityTarget: GameControllerOptions['visibilityTarget'];
  private settings: GameSettings;
  private viewport: Viewport;

  constructor(
    readonly module: GameModule,
    options: GameControllerOptions,
  ) {
    this.now = options.now ?? (() => performance.now());
    this.fixedSeed = options.seed;
    this.seed = options.seed ?? createSeed();
    this.rng = createRng(this.seed);
    this.settings = options.settings;
    this.viewport = options.viewport;
    this.visibilityTarget = options.visibilityTarget ?? null;

    const controller = this;
    // Initialize
    this.instance = module.create({
      container: options.container,
      seed: this.seed,
      get viewport() {
        return controller.viewport;
      },
      get settings() {
        return controller.settings;
      },
      random: () => controller.rng(),
      emit: (event) => controller.handleGameEvent(event),
    });
    this.visibilityTarget?.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  get state(): GameLifecycleState {
    return this._state;
  }

  get score(): number {
    return this._score;
  }

  get currentSeed(): string {
    return this.seed;
  }

  /** Active play time so far, excluding pauses. */
  get elapsedMs(): number {
    return this.activeMs + (this.runningSince === null ? 0 : this.now() - this.runningSince);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): boolean {
    if (this._state !== 'idle') return false;
    this.setState('running');
    this.safely(() => this.instance.start());
    return true;
  }

  pause(): boolean {
    if (this._state !== 'running' || !this.module.manifest.supportsPause) return false;
    this.setState('paused');
    this.safely(() => this.instance.pause());
    return true;
  }

  resume(): boolean {
    if (this._state !== 'paused') return false;
    this.setState('running');
    this.safely(() => this.instance.resume());
    return true;
  }

  restart(): boolean {
    if (this._state === 'idle' || this._state === 'destroyed') return false;
    this.seed = this.fixedSeed ?? createSeed();
    this.rng = createRng(this.seed);
    this.activeMs = 0;
    this.runningSince = null;
    this._score = 0;
    this.emit({ type: 'score', score: 0 });
    if (this._state === 'running') this.runningSince = this.now();
    else this.setState('running');
    this.safely(() => this.instance.restart());
    return true;
  }

  /** Ends the round early (player quit). The game emits `finished` with its current score. */
  finish(): boolean {
    if (this._state !== 'running' && this._state !== 'paused') return false;
    this.safely(() => this.instance.finish());
    // Defensive: if a module failed to emit `finished`, close the round anyway.
    // (The cast widens the type: `instance.finish()` changes `_state` via the emit callback.)
    if ((this._state as GameLifecycleState) !== 'finished') {
      this.completeRound({ score: this._score, outcome: 'quit', stats: {} });
    }
    return true;
  }

  resize(viewport: Viewport): void {
    if (this._state === 'destroyed') return;
    this.viewport = viewport;
    this.safely(() => this.instance.resize(viewport));
  }

  updateSettings(settings: GameSettings): void {
    if (this._state === 'destroyed') return;
    this.settings = settings;
    this.safely(() => this.instance.setSettings?.(settings));
  }

  /** Cleanup. Safe to call multiple times. */
  destroy(): void {
    if (this._state === 'destroyed') return;
    this.visibilityTarget?.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.stopClock();
    try {
      this.instance.destroy();
    } finally {
      this.setState('destroyed');
      this.listeners.clear();
    }
  }

  private onVisibilityChange = () => {
    if (this.visibilityTarget?.visibilityState === 'hidden') this.pause();
  };

  private handleGameEvent(event: GameEvent) {
    if (this._state !== 'running' && this._state !== 'paused') return;
    switch (event.type) {
      case 'score':
        this._score = sanitizeScore(event.score);
        this.emit({ type: 'score', score: this._score });
        break;
      case 'finished':
        this.completeRound(event.result);
        break;
      case 'error':
        this.emit({ type: 'error', message: String(event.message).slice(0, 500) });
        break;
    }
  }

  private completeRound(result: GameResult) {
    this.stopClock();
    this._score = sanitizeScore(result.score);
    this.setState('finished');
    this.emit({
      type: 'finished',
      round: {
        score: this._score,
        outcome: result.outcome,
        stats: result.stats ?? {},
        durationMs: Math.round(this.activeMs),
        seed: this.seed,
      },
    });
  }

  private setState(state: GameLifecycleState) {
    if (state === this._state) return;
    if (this._state === 'running') this.stopClock();
    this._state = state;
    if (state === 'running') this.runningSince = this.now();
    this.emit({ type: 'state', state });
  }

  private stopClock() {
    if (this.runningSince !== null) {
      this.activeMs += this.now() - this.runningSince;
      this.runningSince = null;
    }
  }

  private safely(fn: () => void) {
    try {
      fn();
    } catch (err) {
      this.emit({ type: 'error', message: err instanceof Error ? err.message : 'Game error' });
    }
  }

  private emit(event: ControllerEvent) {
    for (const listener of this.listeners) listener(event);
  }
}
