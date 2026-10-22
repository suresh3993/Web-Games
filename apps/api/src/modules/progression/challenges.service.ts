import { Prisma, type ChallengeType } from '@prisma/client';
import type { CompletedChallenge, DailyChallenges, DailyChallengeView } from '@playverse/shared-types';
import { prisma } from '../../database/prisma';
import { HttpError, notFound } from '../../lib/http-error';
import { notify } from './notifications.service';
import { COUNTED_ROUND } from './snapshot';

type Db = Prisma.TransactionClient;
const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC calendar day as YYYY-MM-DD. */
export const dayKey = (date: Date) => date.toISOString().slice(0, 10);
export const dayStart = (day: string) => new Date(`${day}T00:00:00.000Z`);

/** Small seeded PRNG so every API instance generates the same challenges for a day. */
function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const pick = <T>(random: () => number, items: T[]): T => items[Math.floor(random() * items.length)]!;

/** Rounds a target down to two significant figures (1,234 → 1,200). */
export function niceTarget(value: number): number {
  if (value < 10) return Math.max(1, Math.floor(value));
  const step = 10 ** (Math.floor(Math.log10(value)) - 1);
  return Math.floor(value / step) * step;
}

type ChallengeSpec = Omit<Prisma.DailyChallengeCreateManyInput, 'date'>;

/**
 * Today's challenges are generated on first use, deterministically from the date:
 * a rounds goal, a category goal and a game goal. The game goal asks for a score
 * near the game's median personal best once enough players have one, otherwise for
 * two rounds. Days with challenges created by an admin are left as they are.
 */
async function generate(day: string): Promise<ChallengeSpec[]> {
  const random = seededRandom(`playverse-daily-${day}`);
  const rounds = pick(random, [3, 4, 5]);
  const specs: ChallengeSpec[] = [
    { key: 'auto-rounds', title: 'Warm-up', description: `Finish ${rounds} rounds of any game.`, type: 'PLAY_GAMES', target: rounds, xpReward: 30 },
  ];
  const games = await prisma.game.findMany({
    where: { status: 'PUBLISHED', runtimeKey: { not: null } },
    select: { id: true, title: true, supportsScores: true },
    orderBy: { slug: 'asc' },
  });
  if (!games.length) {
    specs.push({ key: 'auto-minutes', title: 'Time to play', description: 'Play for 10 minutes in total.', type: 'PLAY_MINUTES', target: 10, xpReward: 30 });
    return specs;
  }

  const categories = await prisma.gameCategory.findMany({
    select: { id: true, name: true, _count: { select: { games: { where: { game: { status: 'PUBLISHED' } } } } } },
    orderBy: { sortOrder: 'asc' },
  });
  const eligible = categories.filter((c) => c._count.games >= 3);
  if (eligible.length) {
    const c = pick(random, eligible);
    specs.push({
      key: 'auto-category',
      title: `${c.name} day`,
      description: `Finish 2 rounds of ${c.name} games.`,
      type: 'PLAY_CATEGORY',
      target: 2,
      xpReward: 40,
      categoryId: c.id,
    });
  }

  const scored = games.filter((g) => g.supportsScores);
  const game = pick(random, scored.length ? scored : games);
  const bests = game.supportsScores
    ? await prisma.userGameStat.findMany({
        where: { gameId: game.id, bestScore: { gt: 0 }, user: { status: 'ACTIVE' } },
        select: { bestScore: true },
        orderBy: { bestScore: 'asc' },
      })
    : [];
  if (bests.length >= 5) {
    const target = niceTarget(bests[Math.floor(bests.length / 2)]!.bestScore!);
    specs.push({
      key: 'auto-score',
      title: `${game.title} challenge`,
      description: `Score at least ${target.toLocaleString('en-US')} in ${game.title}.`,
      type: 'REACH_SCORE',
      target,
      xpReward: 50,
      gameId: game.id,
    });
  } else {
    specs.push({
      key: 'auto-game',
      title: `Try ${game.title}`,
      description: `Finish 2 rounds of ${game.title}.`,
      type: 'PLAY_GAMES',
      target: 2,
      xpReward: 50,
      gameId: game.id,
    });
  }
  return specs;
}

const ensured = new Set<string>();

/** Creates the day's challenges if none exist. Safe under concurrency (unique date + key). */
export async function ensureDailyChallenges(day: string): Promise<void> {
  if (ensured.has(day)) return;
  const date = dayStart(day);
  if ((await prisma.dailyChallenge.count({ where: { date } })) === 0) {
    const specs = await generate(day);
    await prisma.dailyChallenge.createMany({ data: specs.map((s) => ({ ...s, date })), skipDuplicates: true });
  }
  if (ensured.size > 30) ensured.clear();
  ensured.add(day);
}

/** Test hook: forget which days were generated in this process. */
export const resetEnsuredDays = () => ensured.clear();

interface DayRound {
  gameId: string;
  rounds: number;
  ms: bigint;
  best: number | null;
}

/** Rounds that count, finished within one UTC day, grouped by game. */
function roundsOnDay(db: Db, userId: string, start: Date): Promise<DayRound[]> {
  const end = new Date(start.getTime() + DAY_MS);
  return db.$queryRaw<DayRound[]>(Prisma.sql`
    SELECT s.game_id AS "gameId", count(*)::int AS rounds, coalesce(sum(s.duration_ms), 0)::bigint AS ms, max(sc.score) AS best
    FROM game_sessions s LEFT JOIN game_scores sc ON sc.session_id = s.id
    WHERE ${COUNTED_ROUND} AND s.user_id = ${userId} AND s.ended_at >= ${start} AND s.ended_at < ${end}
    GROUP BY s.game_id`);
}

interface ChallengeRow {
  id: string;
  type: ChallengeType;
  target: number;
  gameId: string | null;
  categoryId: string | null;
}

function measure(ch: ChallengeRow, rounds: DayRound[], categoriesOf: Map<string, Set<string>>): number {
  const sum = (list: DayRound[], f: (r: DayRound) => number) => list.reduce((total, r) => total + f(r), 0);
  switch (ch.type) {
    case 'PLAY_GAMES':
      return sum(ch.gameId ? rounds.filter((r) => r.gameId === ch.gameId) : rounds, (r) => r.rounds);
    case 'PLAY_MINUTES':
      return Math.floor(sum(rounds, (r) => Number(r.ms)) / 60_000);
    case 'REACH_SCORE':
      return Math.max(0, ...rounds.filter((r) => r.gameId === ch.gameId).map((r) => r.best ?? 0));
    case 'PLAY_CATEGORY':
      return sum(
        rounds.filter((r) => ch.categoryId && categoriesOf.get(r.gameId)?.has(ch.categoryId)),
        (r) => r.rounds,
      );
  }
}

/**
 * Recomputes the player's progress on today's challenges from recorded rounds and
 * completes those that reached their target (XP once, via the unique ledger key).
 * Runs inside the caller's transaction with the player's row locked.
 */
export async function updateChallengeProgress(
  tx: Db,
  userId: string,
  now: Date,
  onlyIds?: string[],
): Promise<{ completed: CompletedChallenge[]; xp: number }> {
  const start = dayStart(dayKey(now));
  const challenges = await tx.dailyChallenge.findMany({
    where: { date: start, ...(onlyIds ? { id: { in: onlyIds } } : {}) },
    select: { id: true, title: true, type: true, target: true, xpReward: true, gameId: true, categoryId: true, progress: { where: { userId } } },
  });
  const open = challenges.filter((c) => !c.progress[0]?.completedAt);
  if (!open.length) return { completed: [], xp: 0 };

  const rounds = await roundsOnDay(tx, userId, start);
  const categoriesOf = new Map<string, Set<string>>();
  if (open.some((c) => c.type === 'PLAY_CATEGORY') && rounds.length) {
    const links = await tx.gameCategoryLink.findMany({ where: { gameId: { in: rounds.map((r) => r.gameId) } } });
    for (const l of links) {
      if (!categoriesOf.has(l.gameId)) categoriesOf.set(l.gameId, new Set());
      categoriesOf.get(l.gameId)!.add(l.categoryId);
    }
  }

  const completed: typeof open = [];
  for (const ch of open) {
    const value = Math.min(ch.target, measure(ch, rounds, categoriesOf));
    const done = value >= ch.target;
    const previous = ch.progress[0];
    if (previous && previous.progress === value && !done) continue;
    if (!previous && value === 0) continue;
    await tx.userChallengeProgress.upsert({
      where: { userId_challengeId: { userId, challengeId: ch.id } },
      create: { userId, challengeId: ch.id, progress: value, completedAt: done ? now : null },
      update: { progress: value, ...(done ? { completedAt: now } : {}) },
    });
    if (done) completed.push(ch);
  }
  if (!completed.length) return { completed: [], xp: 0 };

  const rewarded = completed.filter((c) => c.xpReward > 0);
  if (rewarded.length) {
    await tx.xpTransaction.createMany({
      data: rewarded.map((c) => ({
        userId,
        amount: c.xpReward,
        reason: `Daily challenge: ${c.title}`.slice(0, 64),
        sourceType: 'daily_challenge',
        sourceId: c.id,
      })),
      skipDuplicates: true,
    });
  }
  await notify(
    tx,
    userId,
    completed.map((c) => ({
      type: 'CHALLENGE' as const,
      title: `Daily challenge complete: ${c.title}`,
      body: c.xpReward ? `Nice work! +${c.xpReward} XP.` : 'Nice work!',
      link: '/challenges',
    })),
  );
  return {
    completed: completed.map((c) => ({ id: c.id, title: c.title, xpReward: c.xpReward })),
    xp: rewarded.reduce((sum, c) => sum + c.xpReward, 0),
  };
}

const challengeSelect = {
  id: true,
  date: true,
  title: true,
  description: true,
  type: true,
  target: true,
  xpReward: true,
  game: { select: { slug: true, title: true } },
  category: { select: { slug: true, name: true } },
} satisfies Prisma.DailyChallengeSelect;

type ChallengeViewRow = Prisma.DailyChallengeGetPayload<{ select: typeof challengeSelect }>;

function toView(c: ChallengeViewRow, progress: { progress: number; completedAt: Date | null } | null | undefined, guest: boolean): DailyChallengeView {
  return {
    id: c.id,
    date: dayKey(c.date),
    title: c.title,
    description: c.description,
    type: c.type,
    target: c.target,
    xpReward: c.xpReward,
    game: c.game,
    category: c.category,
    progress: guest ? null : (progress?.progress ?? 0),
    completedAt: progress?.completedAt?.toISOString() ?? null,
  };
}

const TYPE_ORDER: Record<ChallengeType, number> = { PLAY_GAMES: 0, PLAY_MINUTES: 1, PLAY_CATEGORY: 2, REACH_SCORE: 3 };

export async function dailyChallenges(userId: string | null, now = new Date()): Promise<DailyChallenges> {
  const day = dayKey(now);
  await ensureDailyChallenges(day);
  const rows = await prisma.dailyChallenge.findMany({
    where: { date: dayStart(day) },
    select: { ...challengeSelect, ...(userId ? { progress: { where: { userId }, select: { progress: true, completedAt: true } } } : {}) },
    orderBy: [{ xpReward: 'asc' }, { key: 'asc' }],
  });
  const views = rows
    .map((r) => toView(r, 'progress' in r ? (r.progress as { progress: number; completedAt: Date | null }[])[0] : null, !userId))
    .sort((a, b) => a.xpReward - b.xpReward || TYPE_ORDER[a.type] - TYPE_ORDER[b.type]);
  return { date: day, resetsAt: new Date(dayStart(day).getTime() + DAY_MS).toISOString(), challenges: views };
}

/** Returns one of today's challenges with fresh, server-computed progress (see progression.service). */
export async function challengeForToday(id: string, now = new Date()) {
  const challenge = await prisma.dailyChallenge.findUnique({ where: { id }, select: { id: true, date: true } });
  if (!challenge) throw notFound('Challenge not found.');
  if (dayKey(challenge.date) !== dayKey(now)) throw new HttpError(409, 'CONFLICT', 'This challenge is no longer active.');
  return challenge;
}

export async function challengeView(id: string, userId: string): Promise<DailyChallengeView> {
  const row = await prisma.dailyChallenge.findUniqueOrThrow({
    where: { id },
    select: { ...challengeSelect, progress: { where: { userId }, select: { progress: true, completedAt: true } } },
  });
  return toView(row, row.progress[0], false);
}
