import { Prisma } from '@prisma/client';
import { GAME_STATUSES, type AdminDashboard, type DayCount, type GameStatus } from '@suresh/shared-types';
import { env } from '../../config/env';
import { prisma } from '../../database/prisma';
import { redisHealthy } from '../../lib/redis';
import { SESSION_IDLE_TIMEOUT_MS } from '../gameplay/sessions.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY_MS);

/** Fills missing days with zero so charts have one bar per day. */
function series(rows: { day: string; count: number }[], days: number): DayCount[] {
  const byDay = new Map(rows.map((r) => [r.day, r.count]));
  const today = new Date();
  const out: DayCount[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i)).toISOString().slice(0, 10);
    out.push({ date, count: byDay.get(date) ?? 0 });
  }
  return out;
}

/** Users who signed in or started a round since `since`. */
async function activeUsers(since: Date): Promise<number> {
  const [row] = await prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
    SELECT count(*)::int AS count FROM users u
    WHERE u.last_login_at >= ${since}
       OR EXISTS (SELECT 1 FROM game_sessions s WHERE s.user_id = u.id AND s.started_at >= ${since})`);
  return row?.count ?? 0;
}

const launches = (since: Date) => prisma.gameSession.count({ where: { preview: false, startedAt: { gte: since } } });

async function databaseHealth(): Promise<{ status: 'ok' | 'error'; latencyMs: number | null }> {
  const started = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', latencyMs: Math.round((performance.now() - started) * 10) / 10 };
  } catch {
    return { status: 'error', latencyMs: null };
  }
}

export async function dashboard(days = 30): Promise<AdminDashboard> {
  const since = ago(days);
  const [
    users,
    verifiedUsers,
    suspendedUsers,
    newUsers7d,
    activeUsers1d,
    activeUsers7d,
    activeUsers30d,
    launches1d,
    launches7d,
    launches30d,
    gamesByStatusRows,
    openReports,
    flaggedScores7d,
    launchesByDay,
    signupsByDay,
    topGames,
    categories,
    database,
    redis,
    activeSessions,
    activeRounds,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { emailVerifiedAt: { not: null } } }),
    prisma.user.count({ where: { status: 'SUSPENDED' } }),
    prisma.user.count({ where: { createdAt: { gte: ago(7) } } }),
    activeUsers(ago(1)),
    activeUsers(ago(7)),
    activeUsers(ago(30)),
    launches(ago(1)),
    launches(ago(7)),
    launches(ago(30)),
    prisma.game.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.gameReport.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
    prisma.gameScore.count({ where: { flagged: true, createdAt: { gte: ago(7) } } }),
    prisma.$queryRaw<{ day: string; count: number }[]>(Prisma.sql`
      SELECT to_char(date_trunc('day', started_at), 'YYYY-MM-DD') AS day, count(*)::int AS count
      FROM game_sessions WHERE preview = false AND started_at >= ${since} GROUP BY 1`),
    prisma.$queryRaw<{ day: string; count: number }[]>(Prisma.sql`
      SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, count(*)::int AS count
      FROM users WHERE created_at >= ${since} GROUP BY 1`),
    prisma.$queryRaw<{ slug: string; title: string; launches: number; players: number }[]>(Prisma.sql`
      SELECT g.slug, g.title, count(*)::int AS launches, count(DISTINCT s.user_id)::int AS players
      FROM game_sessions s JOIN games g ON g.id = s.game_id
      WHERE s.preview = false AND s.started_at >= ${since}
      GROUP BY g.id ORDER BY launches DESC, g.title ASC LIMIT 10`),
    prisma.$queryRaw<{ slug: string; name: string; launches: number; players: number; games: number }[]>(Prisma.sql`
      SELECT c.slug, c.name,
             count(s.id)::int AS launches,
             count(DISTINCT s.user_id)::int AS players,
             count(DISTINCT g.id) FILTER (WHERE g.status = 'PUBLISHED')::int AS games
      FROM game_categories c
        LEFT JOIN games g ON g.primary_category_id = c.id
        LEFT JOIN game_sessions s ON s.game_id = g.id AND s.preview = false AND s.started_at >= ${since}
      GROUP BY c.id ORDER BY launches DESC, c.sort_order ASC`),
    databaseHealth(),
    redisHealthy(),
    prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
    prisma.gameSession.count({ where: { status: 'ACTIVE', lastHeartbeatAt: { gte: new Date(Date.now() - SESSION_IDLE_TIMEOUT_MS) } } }),
  ]);

  const gamesByStatus = Object.fromEntries(GAME_STATUSES.map((s) => [s, 0])) as Record<GameStatus, number>;
  for (const row of gamesByStatusRows) gamesByStatus[row.status] = row._count._all;

  return {
    totals: {
      users,
      verifiedUsers,
      suspendedUsers,
      newUsers7d,
      activeUsers1d,
      activeUsers7d,
      activeUsers30d,
      launches1d,
      launches7d,
      launches30d,
      gamesByStatus,
      openReports,
      flaggedScores7d,
    },
    launchesByDay: series(launchesByDay, days),
    signupsByDay: series(signupsByDay, days),
    topGames,
    categories,
    health: {
      database,
      redis,
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      environment: env.nodeEnv,
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      activeSessions,
      activeRounds,
    },
  };
}
