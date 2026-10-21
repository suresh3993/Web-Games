/**
 * PLAYVERSE game integration contract.
 *
 * Every native game is a `GameModule`: a static `manifest` plus a `create()`
 * factory. The platform (the "host") owns the DOM container, timing, persistence
 * and score submission; the game owns only its rendering, input and rules.
 *
 *   Lifecycle (enforced by `GameController`):
 *
 *     create() ──► idle ──start()──► running ◄──resume()── paused
 *                                    │   └────pause()────────┘
 *                                    │                        │
 *                     finished ◄─────┴── emit('finished') / finish()
 *                        │
 *                     restart() ──► running        destroy() from any state ──► destroyed
 *
 * Rules for module authors:
 *  - Render only inside `host.container`. Never touch `document.body`, cookies,
 *    storage, `fetch`, or global navigation.
 *  - Use `host.random()` (seeded) instead of `Math.random()` so rounds can be replayed.
 *  - Report score changes via `host.emit({ type: 'score' })` and the end of a
 *    round exactly once via `host.emit({ type: 'finished' })`.
 *  - `destroy()` must remove every listener, timer, animation frame and DOM node it created.
 */

export type GameLifecycleState = 'idle' | 'running' | 'paused' | 'finished' | 'destroyed';

export interface Viewport {
  width: number;
  height: number;
  devicePixelRatio: number;
}

export interface GameSettings {
  soundEnabled: boolean;
  reducedMotion: boolean;
}

export type GameOutcome = 'won' | 'lost' | 'completed' | 'quit';

/** What a game reports when a round ends. Duration is measured by the host, not the game. */
export interface GameResult {
  score: number;
  outcome: GameOutcome;
  /** Game-specific counters (e.g. `{ foodEaten: 12 }`) used for achievements and plausibility checks. */
  stats: Record<string, number>;
}

export type GameEvent =
  | { type: 'score'; score: number }
  | { type: 'finished'; result: GameResult }
  | { type: 'error'; message: string };

/** Services the platform provides to a running game. */
export interface GameHost {
  /** Element the game renders into. The host sizes it; the game fills it. */
  readonly container: HTMLElement;
  readonly viewport: Viewport;
  readonly settings: GameSettings;
  /** Seed for this round; the host may persist it for later verification. */
  readonly seed: string;
  /** Deterministic PRNG in [0, 1) derived from `seed`. Re-seeded on restart. */
  random(): number;
  emit(event: GameEvent): void;
}

/** A live game created by `GameModule.create`. Called only by `GameController`. */
export interface GameInstance {
  start(): void;
  pause(): void;
  resume(): void;
  /** Reset to a fresh round and begin playing immediately. */
  restart(): void;
  /** Host-initiated end of round (e.g. player quits). Must emit `finished` synchronously. */
  finish(): void;
  resize(viewport: Viewport): void;
  setSettings?(settings: GameSettings): void;
  /** Cleanup: release all resources. The instance is never used again. */
  destroy(): void;
}

export interface ScoringRules {
  kind: 'points' | 'time' | 'moves';
  order: 'higher-is-better' | 'lower-is-better';
  label: string;
  /** Upper bound used by the API for plausibility checks. */
  maxScore: number;
}

export interface GameManifest {
  /** Stable identifier; must equal `Game.runtimeKey` in the catalog. */
  key: string;
  version: string;
  engine: 'CANVAS' | 'PHASER' | 'REACT';
  input: { keyboard: boolean; touch: boolean; pointer: boolean };
  supportsPause: boolean;
  supportsSound: boolean;
  orientation: 'any' | 'landscape' | 'portrait';
  /** Preferred width / height ratio for the viewport. */
  aspectRatio: number;
  scoring: ScoringRules | null;
  /** Short control hints shown by the player UI. */
  controls: { action: string; keys: string }[];
}

export interface GameModule {
  manifest: GameManifest;
  create(host: GameHost): GameInstance;
}

export type GameModuleLoader = () => Promise<GameModule>;
