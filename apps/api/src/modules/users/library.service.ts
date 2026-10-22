import type { FavoriteGame, MyGameStats, PlayHistoryEntry } from '@suresh/shared-types';
import { prisma } from '../../database/prisma';
import { notFound } from '../../lib/http-error';
import { PUBLIC, requirePublicGame, summarySelect, toSummary } from '../games/games.service';
import { rankForScore } from '../leaderboards/leaderboards.service';

const LIBRARY_LIMIT = 100;

/** Idempotent: favouriting twice is not an error. Only public games can be favourited. */
export async function addFavorite(userId: string, slug: string): Promise<void> {
  const game = await requirePublicGame(slug);
  await prisma.userFavorite.upsert({
    where: { userId_gameId: { userId, gameId: game.id } },
    create: { userId, gameId: game.id },
    update: {},
  });
}

/** Idempotent; also works for games that were unpublished after being favourited. */
export async function removeFavorite(userId: string, slug: string): Promise<void> {
  const game = await prisma.game.findUnique({ where: { slug }, select: { id: true } });
  if (!game) throw notFound('Game not found.');
  await prisma.userFavorite.deleteMany({ where: { userId, gameId: game.id } });
}

export async function listFavorites(userId: string): Promise<FavoriteGame[]> {
  const rows = await prisma.userFavorite.findMany({
    where: { userId, game: { status: PUBLIC } },
    orderBy: { createdAt: 'desc' },
    take: LIBRARY_LIMIT,
    select: { createdAt: true, game: { select: summarySelect } },
  });
  return rows.map((r) => ({ ...toSummary(r.game), favoritedAt: r.createdAt.toISOString() }));
}

/** Recently played games with personal bests, newest first. */
export async function playHistory(userId: string): Promise<PlayHistoryEntry[]> {
  const rows = await prisma.userGameStat.findMany({
    where: { userId, game: { status: PUBLIC } },
    orderBy: { lastPlayedAt: 'desc' },
    take: LIBRARY_LIMIT,
    select: { bestScore: true, plays: true, totalTimeMs: true, lastPlayedAt: true, game: { select: summarySelect } },
  });
  return rows.map((r) => ({
    game: toSummary(r.game),
    bestScore: r.bestScore,
    plays: r.plays,
    totalTimeMs: Number(r.totalTimeMs),
    lastPlayedAt: r.lastPlayedAt.toISOString(),
  }));
}

export async function myGameStats(userId: string, slug: string): Promise<MyGameStats> {
  const game = await requirePublicGame(slug);
  const [stat, favorite] = await Promise.all([
    prisma.userGameStat.findUnique({ where: { userId_gameId: { userId, gameId: game.id } } }),
    prisma.userFavorite.findUnique({ where: { userId_gameId: { userId, gameId: game.id } }, select: { userId: true } }),
  ]);
  return {
    bestScore: stat?.bestScore ?? null,
    plays: stat?.plays ?? 0,
    totalTimeMs: Number(stat?.totalTimeMs ?? 0),
    lastPlayedAt: stat?.lastPlayedAt.toISOString() ?? null,
    rank: await rankForScore(game.id, stat?.bestScore ?? null),
    isFavorite: Boolean(favorite),
  };
}
