import { randomBytes } from 'node:crypto';
import type { Prisma, User } from '@prisma/client';
import {
  XP_DAILY_CAP_PER_GAME,
  XP_MIN_ROUND_MS,
  xpForRound,
  type GameSessionResult,
  type GameSessionStart,
} from '@playverse/shared-types';
import { MAX_ROUND_MS, type FinishGameSessionInput } from '@playverse/validation';
import { prisma } from '../../database/prisma';
import { forbidden, HttpError, notFound } from '../../lib/http-error';
import { logger } from '../../lib/logger';
import { invalidateGameLeaderboards, rankForScore } from '../leaderboards/leaderboards.service';
import { dayKey, ensureDailyChallenges } from '../progression/challenges.service';
import { applyProgression, lockPlayer } from '../progression/progression.service';
import { checkRound, type PlausibilityFlag } from './plausibility';

/** Sessions without a heartbeat for this long are abandoned when the player starts another round. */
export const SESSION_IDLE_TIMEOUT_MS = 15 * 60_000;
const STAFF_ROLES = new Set(['ADMIN', 'MODERATOR']);

const notPlayable = () => new HttpError(409, 'CONFLICT', 'This game is not available to play yet.');
const roundClosed = (message: string) => new HttpError(409, 'CONFLICT', message);

/**
 * Starts a round. Published games with a runtime start a normal (scored) session.
 * Staff may also launch unpublished games in preview mode for QA: preview rounds
 * never touch scores, stats, XP, rankings or play counts.
 */
export async function startSession(user: User, slug: string, options: { preview?: boolean } = {}): Promise<GameSessionStart> {
  const game = await prisma.game.findUnique({
    where: { slug },
    select: { id: true, status: true, engine: true, runtimeKey: true, externalUrl: true },
  });
  const staff = STAFF_ROLES.has(user.role);
  if (!game || (!staff && (game.status === 'DRAFT' || game.status === 'UNPUBLISHED'))) throw notFound('Game not found.');
  const launchable = game.engine === 'EXTERNAL_IFRAME' ? Boolean(game.externalUrl) : Boolean(game.runtimeKey);
  if (options.preview && !staff) throw forbidden('Only moderators and administrators can start preview rounds.');
  // Unpublished games can only be previewed; staff may also preview published ones (QA without touching real data).
  const preview = game.status !== 'PUBLISHED' || Boolean(options.preview);
  if (!launchable || (preview && !staff)) throw notPlayable();

  const now = new Date();
  const seed = randomBytes(16).toString('hex');
  const [, session, stat] = await prisma.$transaction([
    // Lazy clean-up of this player's stale rounds (closed tabs, crashed browsers).
    prisma.gameSession.updateMany({
      where: {
        userId: user.id,
        status: 'ACTIVE',
        OR: [
          { lastHeartbeatAt: { lt: new Date(now.getTime() - SESSION_IDLE_TIMEOUT_MS) } },
          { startedAt: { lt: new Date(now.getTime() - MAX_ROUND_MS) } },
        ],
      },
      data: { status: 'ABANDONED', endedAt: now },
    }),
    // Server clock for every timestamp used in duration checks.
    prisma.gameSession.create({
      data: { userId: user.id, gameId: game.id, seed, preview, startedAt: now, lastHeartbeatAt: now },
      select: { id: true, startedAt: true },
    }),
    prisma.userGameStat.findUnique({
      where: { userId_gameId: { userId: user.id, gameId: game.id } },
      select: { bestScore: true },
    }),
    // Raw increment: a play is not an edit, so it must not bump the game's updatedAt.
    ...(preview ? [] : [prisma.$executeRaw`UPDATE games SET play_count = play_count + 1 WHERE id = ${game.id}`]),
  ]);

  return {
    id: session.id,
    seed,
    preview,
    startedAt: session.startedAt.toISOString(),
    personalBest: preview ? null : (stat?.bestScore ?? null),
  };
}

/** Keeps an active round alive; 409 once the round has ended or been abandoned. */
export async function heartbeat(userId: string, sessionId: string): Promise<void> {
  const { count } = await prisma.gameSession.updateMany({
    where: { id: sessionId, userId, status: 'ACTIVE' },
    data: { lastHeartbeatAt: new Date() },
  });
  if (count) return;
  const exists = await prisma.gameSession.count({ where: { id: sessionId, userId } });
  throw exists ? roundClosed('This round has already ended.') : notFound('Game session not found.');
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** XP already earned today from rounds of one game (for the per-game daily cap). */
async function xpEarnedToday(tx: Prisma.TransactionClient, userId: string, gameId: string, now: Date): Promise<number> {
  const dayStart = startOfUtcDay(now);
  const sessions = await tx.gameSession.findMany({
    where: { userId, gameId, preview: false, startedAt: { gte: new Date(dayStart.getTime() - MAX_ROUND_MS) } },
    select: { id: true },
  });
  if (!sessions.length) return 0;
  const sum = await tx.xpTransaction.aggregate({
    where: { userId, sourceType: 'game_session', createdAt: { gte: dayStart }, sourceId: { in: sessions.map((s) => s.id) } },
    _sum: { amount: true },
  });
  return sum._sum.amount ?? 0;
}

export interface FinishOutcome {
  result: GameSessionResult;
  gameId: string;
  flags: PlausibilityFlag[];
}

/**
 * Closes a round exactly once and applies its effects in one transaction:
 * score row, personal stats, XP ledger entry and level. Replays and concurrent
 * submissions of the same round get 409; nothing is ever awarded twice.
 */
export async function finishSession(user: User, sessionId: string, input: FinishGameSessionInput): Promise<FinishOutcome> {
  const now = new Date();
  // Today's challenges must exist before the round can count toward them (idempotent, cached per day).
  await ensureDailyChallenges(dayKey(now));
  const { result, gameId, flags, ranked } = await prisma.$transaction(async (tx) => {
    // Serialise progression updates per player: XP caps, best scores, achievements and
    // levels are read-modify-write, so concurrent submissions from one account queue here.
    await lockPlayer(tx, user.id);

    const session = await tx.gameSession.findFirst({
      where: { id: sessionId, userId: user.id },
      select: {
        id: true,
        status: true,
        preview: true,
        startedAt: true,
        game: { select: { id: true, maxScore: true, supportsScores: true } },
      },
    });
    if (!session) throw notFound('Game session not found.');
    if (session.status === 'FINISHED') throw roundClosed('This round has already been submitted.');
    const wallMs = now.getTime() - session.startedAt.getTime();
    if (session.status !== 'ACTIVE' || wallMs > MAX_ROUND_MS) throw roundClosed('This round expired before it was submitted.');

    const gameId = session.game.id;
    const { durationMs, flags } = checkRound({
      score: input.score,
      claimedMs: input.durationMs,
      wallMs,
      maxScore: session.game.maxScore,
    });
    const flagged = flags.length > 0;
    await tx.gameSession.update({ where: { id: session.id }, data: { status: 'FINISHED', endedAt: now, durationMs } });

    const account = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { xp: true, level: true } });
    const base: GameSessionResult = {
      sessionId: session.id,
      preview: session.preview,
      score: input.score,
      outcome: input.outcome,
      durationMs,
      flagged,
      personalBest: null,
      isPersonalBest: false,
      rank: null,
      xpAwarded: 0,
      xpNote: null,
      xp: account.xp,
      level: account.level,
      leveledUp: false,
      achievements: [],
      challengesCompleted: [],
      bonusXp: 0,
    };
    if (session.preview) {
      return { result: { ...base, xpNote: 'Preview rounds are never scored or rewarded.' }, gameId, flags, ranked: false };
    }

    const ranked = session.game.supportsScores && !flagged;
    if (session.game.supportsScores) {
      await tx.gameScore.create({
        data: { userId: user.id, gameId, sessionId: session.id, score: input.score, outcome: input.outcome, stats: input.stats, flagged },
      });
    }

    const previous = await tx.userGameStat.findUnique({
      where: { userId_gameId: { userId: user.id, gameId } },
      select: { bestScore: true },
    });
    const previousBest = previous?.bestScore ?? null;
    const improves = ranked && (previousBest === null || input.score > previousBest);
    const stat = await tx.userGameStat.upsert({
      where: { userId_gameId: { userId: user.id, gameId } },
      create: {
        userId: user.id,
        gameId,
        bestScore: ranked ? input.score : null,
        bestScoreAt: ranked ? now : null,
        plays: 1,
        totalTimeMs: durationMs,
        lastPlayedAt: now,
      },
      update: {
        plays: { increment: 1 },
        totalTimeMs: { increment: durationMs },
        lastPlayedAt: now,
        ...(improves ? { bestScore: input.score, bestScoreAt: now } : {}),
      },
      select: { bestScore: true },
    });

    let xpAwarded = 0;
    let xpNote: string | null = null;
    const full = xpForRound(durationMs);
    if (flagged) xpNote = 'This round failed our plausibility checks, so it earned no XP.';
    else if (full === 0) xpNote = `Rounds shorter than ${XP_MIN_ROUND_MS / 1000} seconds earn no XP.`;
    else {
      const earned = await xpEarnedToday(tx, user.id, gameId, now);
      xpAwarded = Math.max(0, Math.min(full, XP_DAILY_CAP_PER_GAME - earned));
      if (xpAwarded < full) xpNote = `You reached today's XP limit for this game (${XP_DAILY_CAP_PER_GAME} XP). Come back tomorrow!`;
    }

    if (xpAwarded > 0) {
      // The unique (userId, sourceType, sourceId) key is a second guard against double rewards.
      await tx.xpTransaction.create({
        data: { userId: user.id, amount: xpAwarded, reason: 'Finished a round', sourceType: 'game_session', sourceId: session.id },
      });
    }

    // Daily challenges, achievements and the level, written together with the round.
    // Flagged rounds don't count, so there is nothing to re-evaluate for them.
    const progression = flagged ? null : await applyProgression(tx, { id: user.id, xp: account.xp + xpAwarded, level: account.level }, now);

    const result: GameSessionResult = {
      ...base,
      personalBest: stat.bestScore,
      // A first-ever round of 0 points is not much of a record.
      isPersonalBest: improves && (previousBest !== null || input.score > 0),
      xpAwarded,
      xpNote,
      xp: progression?.xp ?? account.xp,
      level: progression?.level ?? account.level,
      leveledUp: progression?.leveledUp ?? false,
      achievements: progression?.achievements ?? [],
      challengesCompleted: progression?.challengesCompleted ?? [],
      bonusXp: progression?.bonusXp ?? 0,
    };
    return { result, gameId, flags, ranked };
  }, { timeout: 15_000 });

  // The round is committed at this point: extras below must never turn it into an error response.
  if (ranked) {
    if (result.score > 0) await invalidateGameLeaderboards(gameId);
    result.rank = await rankForScore(gameId, result.personalBest).catch((err: unknown) => {
      logger.warn({ err, gameId }, 'rank lookup failed after a saved round');
      return null;
    });
  }
  return { result, gameId, flags };
}
