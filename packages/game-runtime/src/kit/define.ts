import type { GameHost, GameInstance, GameManifest, GameModule, ScoringRules } from '../interfaces/game-module';

type ManifestInput = Pick<GameManifest, 'key' | 'engine'> &
  Partial<Omit<GameManifest, 'key' | 'engine' | 'scoring'>> & {
    /** Upper bound for plausibility checks; `null` for games without scores. */
    maxScore: number | null;
    scoreLabel?: string;
  };

/**
 * Builds a GameModule with sensible manifest defaults. All SURESH games report
 * "higher is better" points so leaderboards share one ordering.
 */
export function defineGame(input: ManifestInput, create: (host: GameHost) => GameInstance): GameModule {
  const { maxScore, scoreLabel, ...rest } = input;
  const scoring: ScoringRules | null =
    maxScore === null ? null : { kind: 'points', order: 'higher-is-better', label: scoreLabel ?? 'Score', maxScore };
  const manifest: GameManifest = {
    version: '1.0.0',
    input: { keyboard: true, touch: true, pointer: true },
    supportsPause: true,
    supportsSound: true,
    orientation: 'any',
    aspectRatio: 4 / 3,
    controls: [],
    ...rest,
    scoring,
  };
  return { manifest, create };
}
