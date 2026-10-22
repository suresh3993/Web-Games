import type { Prisma } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { AchievementCriteria, GameSessionResult } from '@suresh/shared-types';
import { dayKey, dayStart, ensureDailyChallenges, niceTarget } from '../src/modules/progression/challenges.service';
import { createClient, createUser, loginAs, prisma, resetDatabase, seedCatalog } from './helpers';

type Client = ReturnType<typeof createClient>;
const MINUTE = 60_000;
const today = () => dayKey(new Date());

beforeEach(async () => {
  await resetDatabase();
  await seedCatalog([
    { slug: 'snake', title: 'Snake', category: 'arcade', status: 'PUBLISHED', runtimeKey: 'snake', maxScore: 10_000 },
    { slug: 'chess', title: 'Chess', category: 'board', status: 'PUBLISHED', runtimeKey: 'chess', maxScore: 100 },
    { slug: 'checkers', title: 'Checkers', category: 'board', status: 'PUBLISHED', runtimeKey: 'checkers', maxScore: 300 },
    { slug: 'reversi', title: 'Reversi', category: 'board', status: 'PUBLISHED', runtimeKey: 'reversi', maxScore: 300 },
  ]);
});
afterAll(() => prisma.$disconnect());

async function achievement(key: string, criteria: AchievementCriteria, xpReward = 25, extra: Partial<Prisma.AchievementCreateInput> = {}) {
  return prisma.achievement.create({
    data: { key, name: key.replace(/-/g, ' '), description: `Achievement ${key}.`, icon: 'Trophy', xpReward, criteria: criteria as Prisma.InputJsonObject, ...extra },
  });
}

/** Freezes today's challenges to one unreachable placeholder (for tests not about challenges). */
const noChallengesToday = () =>
  prisma.dailyChallenge.create({
    data: { date: dayStart(today()), key: 'test-placeholder', title: 'Placeholder', description: 'Not reachable.', type: 'PLAY_MINUTES', target: 100_000, xpReward: 0 },
  });

async function player() {
  const user = await createUser();
  const client = createClient();
  await loginAs(client, user.email);
  return { user, client };
}

async function play(client: Client, slug: string, options: { score?: number; outcome?: string; activeMs?: number } = {}): Promise<GameSessionResult> {
  const activeMs = options.activeMs ?? 2 * MINUTE;
  const start = await client.post('/api/v1/game-sessions', { slug });
  expect(start.status, JSON.stringify(start.body)).toBe(201);
  const id = start.body.data.id as string;
  await prisma.gameSession.update({ where: { id }, data: { startedAt: new Date(Date.now() - activeMs - 1000) } });
  const res = await client.post(`/api/v1/game-sessions/${id}/finish`, {
    score: options.score ?? 10,
    outcome: options.outcome ?? 'lost',
    durationMs: activeMs,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data;
}

describe('achievements', () => {
  beforeEach(noChallengesToday);

  it('unlocks once, awards bonus XP and notifies', async () => {
    await achievement('first-round', { type: 'rounds_played', count: 1 }, 25);
    const { user, client } = await player();
    const first = await play(client, 'snake');
    expect(first.achievements).toEqual([expect.objectContaining({ key: 'first-round', xpReward: 25 })]);
    expect(first).toMatchObject({ xpAwarded: 18, bonusXp: 25, xp: 43 });

    const second = await play(client, 'snake');
    expect(second.achievements).toEqual([]);
    expect(second.xp).toBe(61);
    expect(await prisma.userAchievement.count({ where: { userId: user.id } })).toBe(1);
    expect(await prisma.xpTransaction.count({ where: { userId: user.id, sourceType: 'achievement' } })).toBe(1);

    const notifications = await client.get('/api/v1/notifications');
    expect(notifications.body.data.map((n: { type: string; title: string }) => [n.type, n.title])).toEqual([['ACHIEVEMENT', 'Achievement unlocked: first round']]);
  });

  it('ignores rounds under 10 seconds, flagged rounds and staff previews', async () => {
    await achievement('first-round', { type: 'rounds_played', count: 1 });
    const { client } = await player();
    expect((await play(client, 'snake', { activeMs: 5000 })).achievements).toEqual([]);
    expect((await play(client, 'snake', { score: 20_000 })).achievements).toEqual([]); // above maxScore → flagged
    expect((await play(client, 'snake')).achievements).toHaveLength(1);
  });

  it('chains level achievements when bonus XP raises the level', async () => {
    await achievement('first-round', { type: 'rounds_played', count: 1 }, 90);
    await achievement('level-two', { type: 'level_reached', level: 2 }, 10);
    const { client } = await player();
    const result = await play(client, 'snake');
    expect(result.achievements.map((a) => a.key)).toEqual(['first-round', 'level-two']);
    expect(result).toMatchObject({ xp: 118, level: 2, leveledUp: true, bonusXp: 100 });
    const titles = (await client.get('/api/v1/notifications')).body.data.map((n: { type: string }) => n.type);
    expect(titles).toContain('LEVEL_UP');
  });

  it('supports game wins, best scores and category criteria', async () => {
    await achievement('checkmate', { type: 'wins', count: 1, game: 'chess' });
    await achievement('snake-200', { type: 'score_at_least', game: 'snake', value: 200 });
    await achievement('board-two', { type: 'category_games', category: 'board', count: 2 });
    const { client } = await player();
    expect((await play(client, 'chess', { outcome: 'lost', score: 1 })).achievements).toEqual([]);
    expect((await play(client, 'chess', { outcome: 'won', score: 3 })).achievements.map((a) => a.key)).toEqual(['checkmate']);
    expect((await play(client, 'snake', { score: 150 })).achievements).toEqual([]);
    expect((await play(client, 'snake', { score: 250 })).achievements.map((a) => a.key)).toEqual(['snake-200']);
    expect((await play(client, 'checkers')).achievements.map((a) => a.key)).toEqual(['board-two']);
  });

  it('lists the catalog publicly and progress privately', async () => {
    await achievement('first-round', { type: 'rounds_played', count: 1 });
    await achievement('regular', { type: 'rounds_played', count: 25 }, 75);
    await achievement('retired', { type: 'rounds_played', count: 1 }, 5, { isActive: false });
    const { client } = await player();
    await play(client, 'snake');

    const catalog = await createClient().get('/api/v1/achievements');
    expect(catalog.body.data.map((a: { key: string; unlockedBy: number }) => [a.key, a.unlockedBy])).toEqual([
      ['first-round', 1],
      ['regular', 0],
    ]);
    const mine = await client.get('/api/v1/users/me/achievements');
    const byKey = Object.fromEntries(mine.body.data.map((a: { key: string }) => [a.key, a]));
    expect(byKey['first-round']).toMatchObject({ progress: { current: 1, target: 1 }, unlockedAt: expect.any(String) });
    expect(byKey.regular).toMatchObject({ progress: { current: 1, target: 25 }, unlockedAt: null });
    expect(byKey.retired).toBeUndefined();
    expect((await createClient().get('/api/v1/users/me/achievements')).status).toBe(401);
  });
});

describe('daily challenges', () => {
  it('generates the same three challenges for everyone, once per day', async () => {
    const guest = await createClient().get('/api/v1/challenges/daily');
    expect(guest.status).toBe(200);
    expect(guest.body.data.date).toBe(today());
    expect(guest.body.data.challenges).toHaveLength(3);
    expect(guest.body.data.challenges.every((c: { progress: number | null }) => c.progress === null)).toBe(true);
    const again = await createClient().get('/api/v1/challenges/daily');
    expect(again.body.data.challenges.map((c: { id: string }) => c.id)).toEqual(guest.body.data.challenges.map((c: { id: string }) => c.id));
    expect(await prisma.dailyChallenge.count()).toBe(3);
  });

  it('tracks progress from rounds, completes once with XP, a notification and achievements', async () => {
    await achievement('daily-driver', { type: 'daily_challenges', count: 1 });
    const { user, client } = await player();
    const daily = (await client.get('/api/v1/challenges/daily')).body.data;
    const warmup = daily.challenges.find((c: { title: string }) => c.title === 'Warm-up');
    expect(warmup).toMatchObject({ type: 'PLAY_GAMES', progress: 0 });

    let completedOn: GameSessionResult | null = null;
    let firstCompletion: GameSessionResult | null = null;
    for (let i = 0; i < warmup.target; i++) {
      const result = await play(client, 'reversi');
      if (result.challengesCompleted.some((c) => c.id === warmup.id)) completedOn = result;
      if (result.challengesCompleted.length && !firstCompletion) firstCompletion = result;
    }
    expect(completedOn).not.toBeNull();
    // Reversi is a board game, so the category challenge may complete first; either way the
    // first completed challenge unlocks the achievement in that same round.
    expect(firstCompletion!.achievements.map((a) => a.key)).toContain('daily-driver');

    const after = (await client.get('/api/v1/challenges/daily')).body.data.challenges.find((c: { id: string }) => c.id === warmup.id);
    expect(after).toMatchObject({ progress: warmup.target, completedAt: expect.any(String) });
    await play(client, 'reversi');
    expect(await prisma.xpTransaction.count({ where: { userId: user.id, sourceType: 'daily_challenge', sourceId: warmup.id } })).toBe(1);
    const types = (await client.get('/api/v1/notifications?pageSize=50')).body.data.map((n: { type: string }) => n.type);
    expect(types).toContain('CHALLENGE');
  });

  it('recomputes progress on request from recorded rounds only', async () => {
    const { user, client } = await player();
    const daily = (await client.get('/api/v1/challenges/daily')).body.data;
    const warmup = daily.challenges.find((c: { title: string }) => c.title === 'Warm-up');
    const game = await prisma.game.findUniqueOrThrow({ where: { slug: 'snake' } });
    // Rounds recorded without going through /finish (e.g. before the challenge existed).
    for (let i = 0; i < warmup.target; i++) {
      await prisma.gameSession.create({
        data: { userId: user.id, gameId: game.id, seed: 'x', status: 'FINISHED', startedAt: new Date(Date.now() - 3 * MINUTE), endedAt: new Date(), durationMs: 2 * MINUTE },
      });
    }
    const res = await client.post(`/api/v1/challenges/${warmup.id}/progress`, { progress: 999 });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: warmup.id, progress: warmup.target, completedAt: expect.any(String) });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).xp).toBe(warmup.xpReward);

    const old = await prisma.dailyChallenge.create({
      data: { date: dayStart('2020-01-01'), key: 'old', title: 'Old', description: 'Past challenge.', type: 'PLAY_GAMES', target: 1, xpReward: 10 },
    });
    expect((await client.post(`/api/v1/challenges/${old.id}/progress`)).status).toBe(409);
    expect((await createClient().post(`/api/v1/challenges/${warmup.id}/progress`)).status).toBe(401);
  });

  it('leaves days with admin-made challenges alone and sizes score goals from real scores', async () => {
    await noChallengesToday();
    await createClient().get('/api/v1/challenges/daily');
    expect(await prisma.dailyChallenge.count()).toBe(1);

    // Only Snake is scored and published here; five players have bests.
    await prisma.game.updateMany({ where: { slug: { not: 'snake' } }, data: { status: 'COMING_SOON' } });
    const snake = await prisma.game.findUniqueOrThrow({ where: { slug: 'snake' } });
    for (const [i, best] of [120, 260, 480, 900, 1500].entries()) {
      const u = await createUser({ email: `best${i}@example.com` });
      await prisma.userGameStat.create({ data: { userId: u.id, gameId: snake.id, bestScore: best, plays: 1, lastPlayedAt: new Date() } });
    }
    await ensureDailyChallenges('2030-01-01');
    const generated = await prisma.dailyChallenge.findMany({ where: { date: dayStart('2030-01-01') } });
    expect(generated.find((c) => c.key === 'auto-score')).toMatchObject({ type: 'REACH_SCORE', target: niceTarget(480), gameId: snake.id });
    expect(niceTarget(1234)).toBe(1200);
    expect(niceTarget(87)).toBe(87);
  });
});

describe('notifications', () => {
  it('lists, counts and marks notifications read, privately', async () => {
    const { user, client } = await player();
    const { client: other } = await player();
    await prisma.notification.createMany({
      data: [1, 2, 3].map((i) => ({ userId: user.id, type: 'SYSTEM' as const, title: `Note ${i}`, body: 'Hello', createdAt: new Date(Date.now() - i * 1000) })),
    });
    expect((await client.get('/api/v1/notifications/unread-count')).body.data).toEqual({ unread: 3 });
    const list = await client.get('/api/v1/notifications?pageSize=2');
    expect(list.body.data.map((n: { title: string }) => n.title)).toEqual(['Note 1', 'Note 2']);
    expect(list.body.meta).toMatchObject({ total: 3, totalPages: 2 });

    const id = list.body.data[0].id;
    expect((await other.post(`/api/v1/notifications/${id}/read`)).status).toBe(404);
    expect((await client.post(`/api/v1/notifications/${id}/read`)).status).toBe(204);
    expect((await client.post(`/api/v1/notifications/${id}/read`)).status).toBe(204);
    expect((await client.get('/api/v1/notifications?unread=true')).body.meta.total).toBe(2);
    expect((await client.post('/api/v1/notifications/read-all')).status).toBe(204);
    expect((await client.get('/api/v1/notifications/unread-count')).body.data).toEqual({ unread: 0 });
    expect((await createClient().get('/api/v1/notifications')).status).toBe(401);
  });
});
