import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { GameSessionResult, GameSessionStart } from '@playverse/shared-types';
import { createClient, createUser, loginAs, prisma, resetDatabase, seedCatalog } from './helpers';

type Client = ReturnType<typeof createClient>;
const MINUTE = 60_000;

beforeEach(async () => {
  await resetDatabase();
  await seedCatalog([
    { slug: 'snake', title: 'Snake', category: 'arcade', status: 'PUBLISHED', runtimeKey: 'snake', maxScore: 10_000 },
    { slug: 'sudoku', title: 'Sudoku', category: 'logic', status: 'COMING_SOON', runtimeKey: 'sudoku', maxScore: 5_000 },
    { slug: 'zen-garden', title: 'Zen Garden', category: 'arcade', status: 'PUBLISHED', runtimeKey: 'zen-garden', supportsScores: false },
    { slug: 'published-no-runtime', category: 'arcade', status: 'PUBLISHED' },
    { slug: 'secret-draft', category: 'arcade', status: 'DRAFT', runtimeKey: 'secret-draft' },
  ]);
});
afterAll(() => prisma.$disconnect());

async function player(options: Parameters<typeof createUser>[0] = {}) {
  const user = await createUser(options);
  const client = createClient();
  await loginAs(client, user.email);
  return { user, client };
}

async function start(client: Client, slug = 'snake'): Promise<GameSessionStart> {
  const res = await client.post('/api/v1/game-sessions', { slug });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data;
}

/** Moves a session's start into the past so wall-clock checks see a realistic round. */
const backdate = (id: string, ms: number) =>
  prisma.gameSession.update({ where: { id }, data: { startedAt: new Date(Date.now() - ms), lastHeartbeatAt: new Date(Date.now() - ms) } });

const finish = (client: Client, id: string, body: object) => client.post(`/api/v1/game-sessions/${id}/finish`, body);

/** Starts and finishes a realistic round; returns the API result. */
async function playRound(client: Client, score: number, options: { slug?: string; activeMs?: number } = {}): Promise<GameSessionResult> {
  const activeMs = options.activeMs ?? 2 * MINUTE;
  const session = await start(client, options.slug);
  await backdate(session.id, activeMs + 1000);
  const res = await finish(client, session.id, { score, outcome: 'lost', durationMs: activeMs, stats: { apples: 3 } });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data;
}

describe('POST /game-sessions (launch)', () => {
  it('requires a logged-in, verified account and a CSRF token', async () => {
    const anonymous = createClient();
    expect((await anonymous.post('/api/v1/game-sessions', { slug: 'snake' })).status).toBe(401);

    const { client } = await player({ verified: false });
    const unverified = await client.post('/api/v1/game-sessions', { slug: 'snake' });
    expect(unverified.status).toBe(403);
    expect(unverified.body.error.message).toMatch(/verify/i);

    const { client: verified } = await player();
    const noCsrf = await verified.agent.post('/api/v1/game-sessions').send({ slug: 'snake' });
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body.error.code).toBe('CSRF_INVALID');
  });

  it('starts a round with a server seed, personal best and play count', async () => {
    const { client } = await player();
    const before = await prisma.game.findUniqueOrThrow({ where: { slug: 'snake' } });
    const session = await start(client);
    expect(session.seed).toMatch(/^[0-9a-f]{32}$/);
    expect(session).toMatchObject({ preview: false, personalBest: null });
    const game = await prisma.game.findUniqueOrThrow({ where: { slug: 'snake' } });
    expect(game.playCount).toBe(1);
    // A play is not an edit of the game.
    expect(game.updatedAt).toEqual(before.updatedAt);

    await playRound(client, 120);
    expect((await start(client)).personalBest).toBe(120);
  });

  it('refuses games that are not playable for regular players', async () => {
    const { client } = await player();
    const cases: [string, number][] = [
      ['sudoku', 409], // coming soon
      ['published-no-runtime', 409],
      ['secret-draft', 404], // hidden status
      ['does-not-exist', 404],
    ];
    for (const [slug, status] of cases) {
      expect((await client.post('/api/v1/game-sessions', { slug })).status, slug).toBe(status);
    }
    expect((await client.post('/api/v1/game-sessions', { slug: 'Bad Slug!' })).status).toBe(400);
  });

  it('lets staff preview unpublished games without scores, stats, XP or play counts', async () => {
    const { user, client } = await player({ role: 'MODERATOR' });
    const session = await start(client, 'sudoku');
    expect(session).toMatchObject({ preview: true, personalBest: null });
    await backdate(session.id, 5 * MINUTE);
    const res = await finish(client, session.id, { score: 400, outcome: 'won', durationMs: 4 * MINUTE, stats: {} });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ preview: true, xpAwarded: 0, personalBest: null, rank: null });

    expect(await prisma.gameScore.count()).toBe(0);
    expect(await prisma.userGameStat.count()).toBe(0);
    expect(await prisma.xpTransaction.count()).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).xp).toBe(0);
    expect((await prisma.game.findUniqueOrThrow({ where: { slug: 'sudoku' } })).playCount).toBe(0);
    // Drafts are previewable by staff too.
    expect((await start(client, 'secret-draft')).preview).toBe(true);
  });

  it('abandons stale rounds when a new one starts', async () => {
    const { client } = await player();
    const stale = await start(client);
    await backdate(stale.id, 20 * MINUTE);
    await start(client);
    expect((await prisma.gameSession.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe('ABANDONED');
    const res = await finish(client, stale.id, { score: 10, outcome: 'lost', durationMs: 60_000 });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/expired/);
  });
});

describe('PATCH /game-sessions/:id (heartbeat)', () => {
  it('keeps the owner’s active round alive and rejects everyone else', async () => {
    const { client } = await player();
    const session = await start(client);
    await backdate(session.id, 5 * MINUTE);
    expect((await client.patch(`/api/v1/game-sessions/${session.id}`)).status).toBe(204);
    const row = await prisma.gameSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(Date.now() - row.lastHeartbeatAt.getTime()).toBeLessThan(10_000);

    const { client: other } = await player();
    expect((await other.patch(`/api/v1/game-sessions/${session.id}`)).status).toBe(404);
    expect((await client.patch('/api/v1/game-sessions/not-an-id')).status).toBe(400);

    await finish(client, session.id, { score: 1, outcome: 'quit', durationMs: 1000 });
    expect((await client.patch(`/api/v1/game-sessions/${session.id}`)).status).toBe(409);
  });
});

describe('POST /game-sessions/:id/finish (scores and XP)', () => {
  it('records the score, personal stats and XP in one go', async () => {
    const { user, client } = await player();
    const result = await playRound(client, 250, { activeMs: 3 * MINUTE });
    // 10 base + 4 per active minute (3 min) = 22 XP.
    expect(result).toMatchObject({
      preview: false,
      score: 250,
      outcome: 'lost',
      durationMs: 3 * MINUTE,
      flagged: false,
      personalBest: 250,
      isPersonalBest: true,
      rank: 1,
      xpAwarded: 22,
      xpNote: null,
      xp: 22,
      level: 1,
      leveledUp: false,
    });

    const score = await prisma.gameScore.findFirstOrThrow({ where: { userId: user.id } });
    expect(score).toMatchObject({ score: 250, outcome: 'lost', flagged: false, stats: { apples: 3 } });
    const stat = await prisma.userGameStat.findFirstOrThrow({ where: { userId: user.id } });
    expect(stat).toMatchObject({ bestScore: 250, plays: 1, totalTimeMs: BigInt(3 * MINUTE) });
    expect(await prisma.xpTransaction.count({ where: { userId: user.id } })).toBe(1);

    // A worse round counts as a play but keeps the best.
    const second = await playRound(client, 100, { activeMs: MINUTE });
    expect(second).toMatchObject({ personalBest: 250, isPersonalBest: false, xpAwarded: 14, xp: 36 });
    expect((await prisma.userGameStat.findFirstOrThrow({ where: { userId: user.id } })).plays).toBe(2);
  });

  it('accepts a round exactly once, even under concurrent submissions', async () => {
    const { user, client } = await player();
    const session = await start(client);
    await backdate(session.id, 2 * MINUTE);
    const body = { score: 90, outcome: 'won', durationMs: MINUTE };
    const responses = await Promise.all([finish(client, session.id, body), finish(client, session.id, body), finish(client, session.id, body)]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    expect(await prisma.gameScore.count()).toBe(1);
    expect(await prisma.xpTransaction.count()).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).xp).toBe(14);

    const replay = await finish(client, session.id, body);
    expect(replay.status).toBe(409);
    expect(replay.body.error.message).toMatch(/already been submitted/);
  });

  it('never lets players submit rounds they do not own', async () => {
    const { client: owner } = await player();
    const session = await start(owner);
    const { client: attacker } = await player();
    const res = await finish(attacker, session.id, { score: 5, outcome: 'won', durationMs: 1000 });
    expect(res.status).toBe(404);
    expect((await createClient().post(`/api/v1/game-sessions/${session.id}/finish`, { score: 1, outcome: 'won', durationMs: 1 })).status).toBe(401);
  });

  it('validates the submission', async () => {
    const { client } = await player();
    const session = await start(client);
    const bad = [
      { score: -1, outcome: 'won', durationMs: 1000 },
      { score: 1.5, outcome: 'won', durationMs: 1000 },
      { score: 1, outcome: 'cheated', durationMs: 1000 },
      { score: 1, outcome: 'won', durationMs: 999_999_999 },
      { score: 1, outcome: 'won', durationMs: 1000, stats: { 'bad key': 1 } },
      { score: 1, outcome: 'won', durationMs: 1000, stats: { ok: 'text' } },
    ];
    for (const body of bad) expect((await finish(client, session.id, body)).status, JSON.stringify(body)).toBe(400);
  });

  it('flags implausible rounds: kept off leaderboards and bests, no XP, audited', async () => {
    const { user, client } = await player();
    await playRound(client, 300);

    const tooHigh = await playRound(client, 10_001); // above the game's maxScore
    expect(tooHigh).toMatchObject({ flagged: true, xpAwarded: 0, personalBest: 300, isPersonalBest: false, rank: null });

    // Claims 10 minutes of play on a round that started seconds ago.
    const session = await start(client);
    const res = await finish(client, session.id, { score: 500, outcome: 'won', durationMs: 10 * MINUTE });
    expect(res.body.data).toMatchObject({ flagged: true, xpAwarded: 0 });
    expect(res.body.data.durationMs).toBeLessThan(10_000);

    expect(await prisma.gameScore.count({ where: { flagged: true } })).toBe(2);
    expect((await prisma.userGameStat.findFirstOrThrow({ where: { userId: user.id } })).bestScore).toBe(300);
    const audits = await prisma.auditLog.findMany({ where: { action: 'score.flagged' }, orderBy: { createdAt: 'asc' } });
    expect(audits.map((a) => (a.metadata as { flags: string[] }).flags)).toEqual([
      ['score_above_max'],
      ['duration_exceeds_wall_clock', 'round_too_short'],
    ]);

    const board = await createClient().get('/api/v1/games/snake/leaderboard');
    expect(board.body.data.entries.map((e: { score: number }) => e.score)).toEqual([300]);
  });

  it('awards no XP for very short rounds (but still records them)', async () => {
    const { client } = await player();
    const result = await playRound(client, 40, { activeMs: 5000 });
    expect(result).toMatchObject({ flagged: false, xpAwarded: 0, personalBest: 40 });
    expect(result.xpNote).toMatch(/shorter than 10 seconds/);
  });

  it('caps XP per game per day', async () => {
    const { user, client } = await player();
    const game = await prisma.game.findUniqueOrThrow({ where: { slug: 'snake' } });
    // 9 earlier rounds today worth 290 XP in total.
    for (let i = 0; i < 9; i++) {
      const s = await prisma.gameSession.create({ data: { userId: user.id, gameId: game.id, seed: 'x', status: 'FINISHED' } });
      await prisma.xpTransaction.create({
        data: { userId: user.id, amount: i < 8 ? 30 : 50, reason: 'Finished a round', sourceType: 'game_session', sourceId: s.id },
      });
    }
    await prisma.user.update({ where: { id: user.id }, data: { xp: 290, level: 2 } });

    const capped = await playRound(client, 10, { activeMs: 5 * MINUTE });
    expect(capped.xpAwarded).toBe(10);
    expect(capped.xpNote).toMatch(/today's XP limit/);
    expect((await playRound(client, 10, { activeMs: 5 * MINUTE })).xpAwarded).toBe(0);

    // Other games are unaffected.
    const zen = await playRound(client, 0, { slug: 'zen-garden', activeMs: 5 * MINUTE });
    expect(zen.xpAwarded).toBe(30);
  });

  it('levels players up at 100 × n × (n − 1) / 2 XP', async () => {
    const { user, client } = await player();
    await prisma.user.update({ where: { id: user.id }, data: { xp: 95 } });
    const result = await playRound(client, 10, { activeMs: 2 * MINUTE });
    expect(result).toMatchObject({ xp: 113, level: 2, leveledUp: true });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).level).toBe(2);
  });

  it('counts plays and XP but no score for games without scoring', async () => {
    const { user, client } = await player();
    const result = await playRound(client, 999, { slug: 'zen-garden' });
    expect(result).toMatchObject({ personalBest: null, isPersonalBest: false, rank: null, xpAwarded: 18 });
    expect(await prisma.gameScore.count()).toBe(0);
    expect((await prisma.userGameStat.findFirstOrThrow({ where: { userId: user.id } })).plays).toBe(1);
  });
});

describe('leaderboards', () => {
  it('ranks each player’s best, shares ranks on ties, and hides suspended players', async () => {
    const alice = await player({ displayName: 'Alice' });
    const bob = await player({ displayName: 'Bob' });
    const cara = await player({ displayName: 'Cara' });
    const dan = await player({ displayName: 'Dan' });
    await playRound(alice.client, 500);
    await playRound(alice.client, 200); // not her best
    await playRound(bob.client, 700);
    await playRound(cara.client, 500);
    await playRound(dan.client, 900);
    await prisma.user.update({ where: { id: dan.user.id }, data: { status: 'SUSPENDED' } });

    const res = await alice.client.get('/api/v1/games/snake/leaderboard');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toMatch(/no-store/);
    expect(res.body.data.period).toBe('all');
    expect(res.body.data.entries.map((e: { rank: number; displayName: string; score: number; isYou: boolean }) => [e.rank, e.displayName, e.score, e.isYou])).toEqual([
      [1, 'Bob', 700, false],
      [2, 'Alice', 500, true], // reached 500 first
      [2, 'Cara', 500, false],
    ]);
    expect(res.body.data.entries[0]).not.toHaveProperty('userId');
    expect(res.body.data.entries[0]).not.toHaveProperty('email');
  });

  it('supports rolling day/week windows', async () => {
    const alice = await player({ displayName: 'Alice' });
    const bob = await player({ displayName: 'Bob' });
    await playRound(alice.client, 800);
    await playRound(bob.client, 300);
    await prisma.gameScore.updateMany({ where: { userId: alice.user.id }, data: { createdAt: new Date(Date.now() - 3 * 24 * 60 * MINUTE) } });

    const names = async (period: string) =>
      (await createClient().get(`/api/v1/games/snake/leaderboard?period=${period}`)).body.data.entries.map((e: { displayName: string }) => e.displayName);
    expect(await names('all')).toEqual(['Alice', 'Bob']);
    expect(await names('week')).toEqual(['Alice', 'Bob']);
    expect(await names('day')).toEqual(['Bob']);
    expect((await createClient().get('/api/v1/games/snake/leaderboard?period=year')).status).toBe(400);
    expect((await createClient().get('/api/v1/games/secret-draft/leaderboard')).status).toBe(404);
  });

  it('ranks players globally by XP', async () => {
    const alice = await player({ displayName: 'Alice' });
    const bob = await player({ displayName: 'Bob' });
    await player({ displayName: 'Newbie' }); // 0 XP: not listed
    await playRound(alice.client, 1, { activeMs: MINUTE });
    await playRound(bob.client, 1, { activeMs: 5 * MINUTE });
    const res = await bob.client.get('/api/v1/leaderboards/global');
    expect(res.body.data.map((e: { displayName: string; xp: number; isYou: boolean }) => [e.displayName, e.xp, e.isYou])).toEqual([
      ['Bob', 30, true],
      ['Alice', 14, false],
    ]);
  });
});

describe('favorites, history and personal stats', () => {
  it('adds, lists and removes favorites idempotently', async () => {
    const { client } = await player();
    expect((await createClient().post('/api/v1/games/snake/favorite')).status).toBe(401);
    expect((await client.post('/api/v1/games/snake/favorite')).status).toBe(204);
    expect((await client.post('/api/v1/games/snake/favorite')).status).toBe(204);
    expect((await client.post('/api/v1/games/sudoku/favorite')).status).toBe(204);
    expect((await client.post('/api/v1/games/secret-draft/favorite')).status).toBe(404);

    const list = await client.get('/api/v1/users/me/favorites');
    expect(list.body.data.map((g: { slug: string }) => g.slug)).toEqual(['sudoku', 'snake']);
    expect(list.body.data[0].favoritedAt).toEqual(expect.any(String));
    expect((await client.get('/api/v1/games/snake/me')).body.data.isFavorite).toBe(true);

    expect((await client.del('/api/v1/games/snake/favorite')).status).toBe(204);
    expect((await client.del('/api/v1/games/snake/favorite')).status).toBe(204);
    expect((await client.get('/api/v1/users/me/favorites')).body.data.map((g: { slug: string }) => g.slug)).toEqual(['sudoku']);
    expect((await createClient().get('/api/v1/users/me/favorites')).status).toBe(401);
  });

  it('lists recently played games with personal bests', async () => {
    const { client } = await player();
    await playRound(client, 75);
    await playRound(client, 0, { slug: 'zen-garden' });
    const res = await client.get('/api/v1/users/me/history');
    expect(res.body.data.map((h: { game: { slug: string }; bestScore: number | null; plays: number }) => [h.game.slug, h.bestScore, h.plays])).toEqual([
      ['zen-garden', null, 1],
      ['snake', 75, 1],
    ]);
  });

  it('returns the player’s stats and rank for a game', async () => {
    const { client } = await player();
    const empty = await client.get('/api/v1/games/snake/me');
    expect(empty.body.data).toEqual({ bestScore: null, plays: 0, totalTimeMs: 0, lastPlayedAt: null, rank: null, isFavorite: false });
    await playRound(client, 60, { activeMs: MINUTE });
    const res = await client.get('/api/v1/games/snake/me');
    expect(res.body.data).toMatchObject({ bestScore: 60, plays: 1, totalTimeMs: MINUTE, rank: 1 });
    expect((await createClient().get('/api/v1/games/snake/me')).status).toBe(401);
  });
});

describe('POST /games/:slug/reports', () => {
  it('files a report once per open issue and validates input', async () => {
    const { client } = await player();
    const body = { reason: 'BROKEN', details: 'The snake froze after level two.' };
    expect((await createClient().post('/api/v1/games/snake/reports', body)).status).toBe(401);
    expect((await client.post('/api/v1/games/snake/reports', body)).status).toBe(202);
    expect((await client.post('/api/v1/games/snake/reports', body)).status).toBe(202);
    expect(await prisma.gameReport.count()).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'game.reported' } })).toBe(1);

    const invalid = await client.post('/api/v1/games/snake/reports', { reason: 'SPAM', details: 'short' });
    expect(invalid.status).toBe(400);
    expect(Object.keys(invalid.body.error.fields).sort()).toEqual(['details', 'reason']);
    expect((await client.post('/api/v1/games/secret-draft/reports', body)).status).toBe(404);
  });
});
