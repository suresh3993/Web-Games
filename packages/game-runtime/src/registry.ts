import type { GameModule, GameModuleLoader } from './interfaces/game-module';

/**
 * Native game modules, keyed by `Game.runtimeKey`. Each entry is a dynamic
 * import so that Vite emits one chunk per game: the homepage never downloads a
 * game engine, and the player page downloads only the game being launched.
 */
export const gameRegistry = {
  snake: () => import('./games/snake/index').then((m) => m.snakeGame),
} satisfies Record<string, GameModuleLoader>;

export type RuntimeKey = keyof typeof gameRegistry;

export const RUNTIME_KEYS = Object.keys(gameRegistry) as RuntimeKey[];

export function hasRuntime(key: string | null | undefined): key is RuntimeKey {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(gameRegistry, key);
}

export async function loadGameModule(key: string): Promise<GameModule> {
  if (!hasRuntime(key)) throw new Error(`No runtime registered for "${key}"`);
  const module = await gameRegistry[key]();
  if (module.manifest.key !== key) {
    throw new Error(`Runtime key mismatch: registry "${key}" vs manifest "${module.manifest.key}"`);
  }
  return module;
}
