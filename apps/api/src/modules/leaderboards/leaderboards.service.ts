import { Prisma } from '@prisma/client';
import type { GlobalLeaderboardEntry, Leaderboard, LeaderboardPeriod } from '@playverse/shared-types';
import { prisma } from '../../database/prisma';
import { cached, invalidateCache } from '../../lib/cache';

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_MS: Record<Exclude<LeaderboardPeriod, 'all'>, number> = { week: 7 * DAY_MS, day: DAY_MS };

interface BoardRow {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  level: number;
  score: number;
  achievedAt: string;
}

/**
 * All-time boards read each player's best from `user_game_stats` (indexed on game + best score).
 * Rolling week/day boards take each player's best unflagged score inside the window.
 * Ties go to whoever reached the score first. Flagged scores and suspended players never appear.
 */
async function loadBoard(gameId: string, period: LeaderboardPeriod, limit: number): Promise<BoardRow[]> {
  if (period === 'all') {
    const rows = await prisma.userGameStat.findMany({
      where: { gameId, bestScore: { gt: 0 }, user: { status: 'ACTIVE' } },
      orderBy: [{ bestScore: 'desc' }, { bestScoreAt: 'asc' }, { userId: 'asc' }],
      take: limit,
      select: {
        bestScore: true,
        bestScoreAt: true,
        lastPlayedAt: true,
        user: { select: { id: true, displayName: true, avatarUrl: true, level: true } },
      },
    });
    return rows.map((r) => ({
      userId: r.user.id,
      displayName: r.user.displayName,
      avatarUrl: r.user.avatarUrl,
      level: r.user.level,
      score: r.bestScore ?? 0,
      achievedAt: (r.bestScoreAt ?? r.lastPlayedAt).toISOString(),
    }));
  }

  const since = new Date(Date.now() - PERIOD_MS[period]);
  const rows = await prisma.$queryRaw<(Omit<BoardRow, 'achievedAt'> & { achievedAt: Date })[]>(Prisma.sql`
    SELECT b.user_id AS "userId", u.display_name AS "displayName", u.avatar_url AS "avatarUrl", u.level,
           b.score, b.created_at AS "achievedAt"
    FROM (
      SELECT DISTINCT ON (s.user_id) s.user_id, s.score, s.created_at
      FROM game_scores s
      WHERE s.game_id = ${gameId} AND s.flagged = false AND s.score > 0 AND s.created_at >= ${since}
      ORDER BY s.user_id, s.score DESC, s.created_at ASC
    ) b
    JOIN users u ON u.id = b.user_id AND u.status = 'ACTIVE'
    ORDER BY b.score DESC, b.created_at ASC, b.user_id ASC
    LIMIT ${limit}`);
  return rows.map((r) => ({ ...r, achievedAt: r.achievedAt.toISOString() }));
}

export async function gameLeaderboard(
  gameId: string,
  period: LeaderboardPeriod,
  limit: number,
  viewerId?: string,
): Promise<Leaderboard> {
  const rows = await cached(`leaderboard:${gameId}:${period}:${limit}`, 30, () => loadBoard(gameId, period, limit));
  let rank = 0;
  let previous: number | null = null;
  return {
    period,
    entries: rows.map((row, index) => {
      // Standard competition ranking: equal scores share a rank (1, 2, 2, 4).
      if (row.score !== previous) rank = index + 1;
      previous = row.score;
      const { userId, ...rest } = row;
      return { rank, ...rest, isYou: userId === viewerId };
    }),
  };
}

/** Drops cached boards for a game after a new ranked score. */
export const invalidateGameLeaderboards = (gameId: string) => invalidateCache(`leaderboard:${gameId}:`);

/** All-time rank of a best score (1 + players with a strictly better best). */
export async function rankForScore(gameId: string, bestScore: number | null): Promise<number | null> {
  if (bestScore === null || bestScore <= 0) return null;
  const better = await prisma.userGameStat.count({
    where: { gameId, bestScore: { gt: bestScore }, user: { status: 'ACTIVE' } },
  });
  return better + 1;
}

export async function globalLeaderboard(limit: number, viewerId?: string): Promise<GlobalLeaderboardEntry[]> {
  const rows = await cached(`leaderboard:global:${limit}`, 60, () =>
    prisma.user.findMany({
      where: { status: 'ACTIVE', xp: { gt: 0 } },
      orderBy: [{ xp: 'desc' }, { createdAt: 'asc' }],
      take: limit,
      select: { id: true, displayName: true, avatarUrl: true, level: true, xp: true },
    }),
  );
  let rank = 0;
  let previous: number | null = null;
  return rows.map(({ id, ...row }, index) => {
    if (row.xp !== previous) rank = index + 1;
    previous = row.xp;
    return { rank, ...row, isYou: id === viewerId };
  });
}
