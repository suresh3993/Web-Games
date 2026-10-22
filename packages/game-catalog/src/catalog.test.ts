import { describe, expect, it } from 'vitest';
import { loadGameModule, RUNTIME_KEYS, hasRuntime } from '@suresh/game-runtime';
import { achievementInputSchema } from '@suresh/validation';
import { ACHIEVEMENTS, CATEGORIES, GAMES } from './index';

const FIRST_MILESTONE = [
  'snake',
  'block-puzzle',
  'minesweeper',
  'sudoku',
  'memory-match',
  'tic-tac-toe',
  'four-in-a-row',
  'sliding-puzzle',
  'brick-breaker',
  'typing-challenge',
];

describe('game catalog integrity', () => {
  it('contains at least 100 entries', () => {
    expect(GAMES.length).toBeGreaterThanOrEqual(100);
  });

  it('has unique slugs and titles', () => {
    expect(new Set(GAMES.map((g) => g.slug)).size).toBe(GAMES.length);
    expect(new Set(GAMES.map((g) => g.title.toLowerCase())).size).toBe(GAMES.length);
  });

  it('has distinct descriptions and instructions (no duplicated filler records)', () => {
    for (const field of ['summary', 'details', 'howToPlay'] as const) {
      expect(new Set(GAMES.map((g) => g[field])).size, field).toBe(GAMES.length);
    }
  });

  it('uses valid, kebab-case slugs', () => {
    for (const game of GAMES) expect(game.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('references only known categories and never repeats the primary category', () => {
    const slugs = new Set<string>(CATEGORIES.map((c) => c.slug));
    for (const game of GAMES) {
      expect(slugs.has(game.category), game.slug).toBe(true);
      for (const extra of game.extraCategories ?? []) {
        expect(slugs.has(extra), `${game.slug} → ${extra}`).toBe(true);
        expect(extra).not.toBe(game.category);
      }
    }
  });

  it('gives every category at least three games', () => {
    for (const category of CATEGORIES) {
      const count = GAMES.filter((g) => g.category === category.slug || g.extraCategories?.includes(category.slug)).length;
      expect(count, category.slug).toBeGreaterThanOrEqual(3);
    }
  });

  it('tags every local two-player game with the multiplayer category', () => {
    for (const game of GAMES.filter((g) => g.multiplayerMode)) {
      expect([game.category, ...(game.extraCategories ?? [])], game.slug).toContain('multiplayer');
    }
  });

  it('assigns the first ten required games to batch 1', () => {
    expect(GAMES.filter((g) => g.batch === 1).map((g) => g.slug).sort()).toEqual([...FIRST_MILESTONE].sort());
  });

  it('only references runtime keys that exist in the game runtime registry, and vice versa', () => {
    const referenced = GAMES.flatMap((g) => (g.runtimeKey ? [g.runtimeKey] : []));
    for (const key of referenced) expect(hasRuntime(key), key).toBe(true);
    expect([...RUNTIME_KEYS].sort()).toEqual([...referenced].sort());
  });

  it('only uses in-house licensing for native games', () => {
    expect(GAMES.every((g) => g.license === 'ORIGINAL')).toBe(true);
  });

  it('matches every catalog entry to its runtime manifest (engine and scoring)', async () => {
    for (const game of GAMES) {
      expect(game.runtimeKey, `${game.slug} has no runtime module`).toBeDefined();
      const module = await loadGameModule(game.runtimeKey!);
      expect(module.manifest.engine, game.slug).toBe(game.engine);
      if (game.supportsScores) expect(module.manifest.scoring?.maxScore ?? 0, game.slug).toBeGreaterThan(0);
    }
    // Imports all 114 game modules (TypeScript transformed on the fly): allow for slow machines.
  }, 60_000);
});

describe('achievement catalog', () => {
  it('has unique keys and criteria the API accepts, referencing real games and categories', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.key)).size).toBe(ACHIEVEMENTS.length);
    const games = new Set(GAMES.map((g) => g.slug));
    const categories = new Set<string>(CATEGORIES.map((c) => c.slug));
    for (const a of ACHIEVEMENTS) {
      expect(achievementInputSchema.safeParse(a).success, a.key).toBe(true);
      const c = a.criteria;
      if ((c.type === 'wins' || c.type === 'score_at_least') && c.game) expect(games.has(c.game), `${a.key} → ${c.game}`).toBe(true);
      if (c.type === 'category_games') expect(categories.has(c.category), `${a.key} → ${c.category}`).toBe(true);
    }
  });

  it('only sets score thresholds a game can actually reach', async () => {
    for (const a of ACHIEVEMENTS) {
      if (a.criteria.type !== 'score_at_least') continue;
      const module = await loadGameModule(a.criteria.game);
      expect(a.criteria.value, a.key).toBeLessThanOrEqual(module.manifest.scoring?.maxScore ?? 0);
    }
  }, 30_000);
});
