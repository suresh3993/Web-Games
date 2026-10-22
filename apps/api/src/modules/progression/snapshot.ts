import { Prisma } from '@prisma/client';
import { XP_MIN_ROUND_MS, type AchievementCriteria } from '@suresh/shared-types';

type Db = Prisma.TransactionClient;

/**
 * Everything achievement criteria need, computed from recorded rounds. A round counts
 * when it finished, was not a staff preview, passed the plausibility checks and lasted
 * at least XP_MIN_ROUND_MS (the same bar as earning XP, so instant rounds can't be farmed).
 */
export interface PlayerSnapshot {
  rounds: number;
  distinctGames: number;
  playMs: number;
  wins: number;
  winsByGame: Map<string, number>;
  bestByGame: Map<string, number>;
  categoryGames: Map<string, number>;
  challengesCompleted: number;
  level: number;
}

/** Filter for rounds that count (games without scores have no score row, hence IS DISTINCT FROM). */
export const COUNTED_ROUND = Prisma.sql`s.status = 'FINISHED' AND s.preview = false
  AND sc.flagged IS DISTINCT FROM true AND s.duration_ms >= ${XP_MIN_ROUND_MS}`;
const COUNTED_ROUNDS = Prisma.sql`game_sessions s LEFT JOIN game_scores sc ON sc.session_id = s.id WHERE ${COUNTED_ROUND}`;

export async function loadSnapshot(db: Db, userId: string, level: number, categories: string[] = []): Promise<PlayerSnapshot> {
  const [totals, wins, bests, categoryRows, challengesCompleted] = await Promise.all([
    db.$queryRaw<{ rounds: number; games: number; ms: bigint }[]>(Prisma.sql`
      SELECT count(*)::int AS rounds, count(DISTINCT s.game_id)::int AS games, coalesce(sum(s.duration_ms), 0)::bigint AS ms
      FROM ${COUNTED_ROUNDS} AND s.user_id = ${userId}`),
    db.$queryRaw<{ slug: string; wins: number }[]>(Prisma.sql`
      SELECT g.slug, count(*)::int AS wins
      FROM game_sessions s
        LEFT JOIN game_scores sc ON sc.session_id = s.id
        JOIN games g ON g.id = s.game_id
      WHERE ${COUNTED_ROUND} AND s.user_id = ${userId} AND sc.outcome = 'won'
      GROUP BY g.slug`),
    db.userGameStat.findMany({
      where: { userId, bestScore: { not: null } },
      select: { bestScore: true, game: { select: { slug: true } } },
    }),
    categories.length
      ? db.$queryRaw<{ slug: string; games: number }[]>(Prisma.sql`
          SELECT c.slug, count(DISTINCT s.game_id)::int AS games
          FROM game_sessions s
            LEFT JOIN game_scores sc ON sc.session_id = s.id
            JOIN game_category_links l ON l.game_id = s.game_id
            JOIN game_categories c ON c.id = l.category_id
          WHERE ${COUNTED_ROUND} AND s.user_id = ${userId} AND c.slug = ANY(${categories})
          GROUP BY c.slug`)
      : Promise.resolve([]),
    db.userChallengeProgress.count({ where: { userId, completedAt: { not: null } } }),
  ]);

  const total = totals[0] ?? { rounds: 0, games: 0, ms: 0n };
  return {
    rounds: total.rounds,
    distinctGames: total.games,
    playMs: Number(total.ms),
    wins: wins.reduce((sum, w) => sum + w.wins, 0),
    winsByGame: new Map(wins.map((w) => [w.slug, w.wins])),
    bestByGame: new Map(bests.map((b) => [b.game.slug, b.bestScore ?? 0])),
    categoryGames: new Map(categoryRows.map((c) => [c.slug, c.games])),
    challengesCompleted,
    level,
  };
}

/** Current value and target of a criterion for a player. */
export function criteriaProgress(c: AchievementCriteria, s: PlayerSnapshot): { current: number; target: number } {
  switch (c.type) {
    case 'rounds_played':
      return { current: s.rounds, target: c.count };
    case 'distinct_games':
      return { current: s.distinctGames, target: c.count };
    case 'wins':
      return { current: c.game ? (s.winsByGame.get(c.game) ?? 0) : s.wins, target: c.count };
    case 'score_at_least':
      return { current: s.bestByGame.get(c.game) ?? 0, target: c.value };
    case 'level_reached':
      return { current: s.level, target: c.level };
    case 'play_minutes':
      return { current: Math.floor(s.playMs / 60_000), target: c.minutes };
    case 'category_games':
      return { current: s.categoryGames.get(c.category) ?? 0, target: c.count };
    case 'daily_challenges':
      return { current: s.challengesCompleted, target: c.count };
  }
}

export const isMet = (c: AchievementCriteria, s: PlayerSnapshot) => {
  const { current, target } = criteriaProgress(c, s);
  return current >= target;
};

/** Categories referenced by a set of criteria (so the snapshot only computes what is needed). */
export const categoriesIn = (criteria: AchievementCriteria[]) => [
  ...new Set(criteria.flatMap((c) => (c.type === 'category_games' ? [c.category] : []))),
];
