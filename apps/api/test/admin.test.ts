import sharp from 'sharp';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createClient, createUser, lastEmailTo, loginAs, prisma, resetDatabase, seedCatalog } from './helpers';


beforeEach(async () => {
  await resetDatabase();
  await seedCatalog([
    { slug: 'snake', title: 'Snake', category: 'arcade', status: 'PUBLISHED', runtimeKey: 'snake', maxScore: 10_000 },
    { slug: 'sudoku', title: 'Sudoku', category: 'logic', extraCategories: ['puzzle'], status: 'COMING_SOON', runtimeKey: 'sudoku', maxScore: 8000 },
    { slug: 'planned-game', title: 'Planned Game', category: 'puzzle', status: 'COMING_SOON' },
  ]);
});
afterAll(() => prisma.$disconnect());

async function as(role: 'USER' | 'MODERATOR' | 'ADMIN', email?: string) {
  const user = await createUser({ role, email, displayName: `${role.toLowerCase()} account` });
  const client = createClient();
  await loginAs(client, user.email);
  return { user, client };
}

const gameId = async (slug: string) => (await prisma.game.findUniqueOrThrow({ where: { slug } })).id;

describe('admin authorization (server-side)', () => {
  it('requires a session and a staff role for every admin endpoint', async () => {
    expect((await createClient().get('/api/v1/admin/dashboard')).status).toBe(401);
    const { user, client } = await as('USER');
    const id = await gameId('snake');
    const attempts: [string, () => Promise<{ status: number }>][] = [
      ['GET dashboard', () => client.get('/api/v1/admin/dashboard')],
      ['GET users', () => client.get('/api/v1/admin/users')],
      ['PATCH status', () => client.patch(`/api/v1/admin/users/${user.id}/status`, { status: 'SUSPENDED', reason: 'testing access' })],
      ['PATCH own role', () => client.patch(`/api/v1/admin/users/${user.id}/role`, { role: 'ADMIN' })],
      ['GET reports', () => client.get('/api/v1/admin/reports')],
      ['GET games', () => client.get('/api/v1/admin/games')],
      ['PATCH game', () => client.patch(`/api/v1/admin/games/${id}`, { isFeatured: true })],
      ['DELETE game', () => client.del(`/api/v1/admin/games/${id}`)],
      ['POST category', () => client.post('/api/v1/admin/categories', { slug: 'x-cat', name: 'X', description: 'Some category', icon: 'Puzzle', accentColor: '#123456' })],
      ['GET achievements', () => client.get('/api/v1/admin/achievements')],
      ['GET challenges', () => client.get('/api/v1/admin/challenges')],
      ['GET audit', () => client.get('/api/v1/admin/audit-logs')],
    ];
    for (const [name, attempt] of attempts) expect((await attempt()).status, name).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe('USER');
    // Unknown fields on the profile endpoint are stripped, so the role can't be smuggled in either.
    await client.patch('/api/v1/users/me', { displayName: 'Sneaky', role: 'ADMIN' });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe('USER');
  });

  it('gives moderators moderation tools but not administration', async () => {
    const { client } = await as('MODERATOR');
    const id = await gameId('snake');
    for (const url of ['/api/v1/admin/dashboard', '/api/v1/admin/users', '/api/v1/admin/reports', '/api/v1/admin/games', '/api/v1/admin/categories']) {
      expect((await client.get(url)).status, url).toBe(200);
    }
    expect((await client.patch(`/api/v1/admin/games/${id}`, { isFeatured: true })).status).toBe(403);
    expect((await client.get('/api/v1/admin/audit-logs')).status).toBe(403);
    expect((await client.get('/api/v1/admin/achievements')).status).toBe(403);
    const target = await createUser();
    expect((await client.patch(`/api/v1/admin/users/${target.id}/role`, { role: 'MODERATOR' })).status).toBe(403);
  });
});

describe('dashboard', () => {
  it('reports users, activity, launches, games and health', async () => {
    const { client } = await as('ADMIN');
    const { client: playerClient } = await as('USER');
    await playerClient.post('/api/v1/game-sessions', { slug: 'snake' });
    const res = await client.get('/api/v1/admin/dashboard');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toMatch(/no-store/);
    const d = res.body.data;
    expect(d.totals).toMatchObject({ users: 2, activeUsers1d: 2, launches1d: 1, launches30d: 1, openReports: 0 });
    expect(d.totals.gamesByStatus).toMatchObject({ PUBLISHED: 1, COMING_SOON: 2, DRAFT: 0 });
    expect(d.launchesByDay).toHaveLength(30);
    expect(d.launchesByDay.at(-1)).toEqual({ date: new Date().toISOString().slice(0, 10), count: 1 });
    expect(d.topGames).toEqual([{ slug: 'snake', title: 'Snake', launches: 1, players: 1 }]);
    expect(d.categories.find((c: { slug: string }) => c.slug === 'arcade')).toMatchObject({ launches: 1, players: 1, games: 1 });
    expect(d.health).toMatchObject({ database: { status: 'ok' }, redis: 'disabled', activeRounds: 1 });
  });
});

describe('user moderation', () => {
  it('suspends a player: sessions revoked, email sent, audited; then reactivates', async () => {
    const { client: mod } = await as('MODERATOR');
    const target = await createUser({ displayName: 'Rule Breaker' });
    const targetClient = createClient();
    await loginAs(targetClient, target.email);

    const res = await mod.patch(`/api/v1/admin/users/${target.id}/status`, { status: 'SUSPENDED', reason: 'Cheating on leaderboards' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SUSPENDED');
    expect((await targetClient.get('/api/v1/auth/me')).status).toBe(401);
    expect((await lastEmailTo(target.email)).text).toContain('Cheating on leaderboards');
    const entry = await prisma.auditLog.findFirstOrThrow({ where: { action: 'admin.user_suspended', targetId: target.id } });
    expect(entry.metadata).toMatchObject({ reason: 'Cheating on leaderboards' });

    expect((await mod.patch(`/api/v1/admin/users/${target.id}/status`, { status: 'ACTIVE', reason: 'Appeal accepted' })).body.data.status).toBe('ACTIVE');
    expect((await mod.patch(`/api/v1/admin/users/${target.id}/status`, { status: 'SUSPENDED', reason: 'no' })).status).toBe(400);
  });

  it('limits moderators to regular players and blocks changes to your own account', async () => {
    const { user: me, client: mod } = await as('MODERATOR');
    const otherMod = await createUser({ role: 'MODERATOR' });
    expect((await mod.patch(`/api/v1/admin/users/${otherMod.id}/status`, { status: 'SUSPENDED', reason: 'Not allowed' })).status).toBe(403);
    expect((await mod.patch(`/api/v1/admin/users/${me.id}/status`, { status: 'SUSPENDED', reason: 'Not allowed' })).status).toBe(403);
    const { client: admin } = await as('ADMIN');
    expect((await admin.patch(`/api/v1/admin/users/${otherMod.id}/status`, { status: 'SUSPENDED', reason: 'Admins may do this' })).status).toBe(200);
  });

  it('lets admins change other people’s roles, never their own', async () => {
    const { user: me, client: admin } = await as('ADMIN');
    const { user: target, client: targetClient } = await as('USER');
    expect((await admin.patch(`/api/v1/admin/users/${me.id}/role`, { role: 'USER' })).status).toBe(403);
    expect((await targetClient.get('/api/v1/admin/dashboard')).status).toBe(403);
    const res = await admin.patch(`/api/v1/admin/users/${target.id}/role`, { role: 'MODERATOR' });
    expect(res.body.data.role).toBe('MODERATOR');
    // The role is re-read from the database on every request: access applies immediately.
    expect((await targetClient.get('/api/v1/admin/dashboard')).status).toBe(200);
    expect(await prisma.notification.count({ where: { userId: target.id, type: 'SYSTEM' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'admin.user_role_changed', targetId: target.id } })).toBe(1);
  });

  it('searches and pages users, and shows details', async () => {
    const { client: admin } = await as('ADMIN');
    await createUser({ email: 'findme@example.com', displayName: 'Needle' });
    const res = await admin.get('/api/v1/admin/users?q=needle');
    expect(res.body.data.map((u: { email: string }) => u.email)).toEqual(['findme@example.com']);
    const detail = await admin.get(`/api/v1/admin/users/${res.body.data[0].id}`);
    expect(detail.body.data).toMatchObject({ displayName: 'Needle', stats: { rounds: 0, flaggedScores: 0 } });
  });
});

describe('game management', () => {
  const newGame = {
    slug: 'star-forge',
    title: 'Star Forge',
    shortDescription: 'Build stars from cosmic dust.',
    description: 'A planned game about building stars from cosmic dust and gravity.',
    instructions: 'Drag dust together until it ignites.',
    difficulty: 'MEDIUM',
    supportedDevices: ['DESKTOP', 'MOBILE'],
    estimatedMinutes: 8,
    engine: 'CANVAS',
    primaryCategory: 'arcade',
    extraCategories: ['puzzle'],
  };

  it('creates, edits and lists catalog entries of every status', async () => {
    const { client } = await as('ADMIN');
    const created = await client.post('/api/v1/admin/games', newGame);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.data).toMatchObject({ slug: 'star-forge', status: 'DRAFT', runtimeKey: null, categories: ['arcade', 'puzzle'] });
    expect((await client.post('/api/v1/admin/games', newGame)).status).toBe(409);
    expect((await client.post('/api/v1/admin/games', { ...newGame, slug: 'other', primaryCategory: 'nope' })).status).toBe(400);

    const id = created.body.data.id;
    const edited = await client.patch(`/api/v1/admin/games/${id}`, { title: 'Star Forge Deluxe', status: 'COMING_SOON', extraCategories: [] });
    expect(edited.body.data).toMatchObject({ title: 'Star Forge Deluxe', status: 'COMING_SOON', categories: ['arcade'] });
    expect((await createClient().get('/api/v1/games/star-forge')).body.data.title).toBe('Star Forge Deluxe');

    const list = await client.get('/api/v1/admin/games?status=coming_soon&sort=title');
    expect(list.body.data.map((g: { slug: string }) => g.slug)).toEqual(['planned-game', 'star-forge', 'sudoku']);
    expect(await prisma.auditLog.count({ where: { action: { startsWith: 'admin.game_' } } })).toBe(2);
  });

  it('publishes only games with a runtime whose launch was tested in preview', async () => {
    const { client } = await as('ADMIN');
    const sudoku = await gameId('sudoku');
    const blocked = await client.patch(`/api/v1/admin/games/${sudoku}`, { status: 'PUBLISHED' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toMatch(/preview mode/);
    expect((await client.patch(`/api/v1/admin/games/${await gameId('planned-game')}`, { status: 'PUBLISHED' })).status).toBe(409);

    // A staff preview round of the game is the evidence that its launch flow works here.
    const session = await client.post('/api/v1/game-sessions', { slug: 'sudoku' });
    expect(session.body.data.preview).toBe(true);
    await client.post(`/api/v1/game-sessions/${session.body.data.id}/finish`, { score: 0, outcome: 'quit', durationMs: 500 });
    expect((await client.get(`/api/v1/admin/games/${sudoku}`)).body.data.previewTested).toBe(true);

    const published = await client.patch(`/api/v1/admin/games/${sudoku}`, { status: 'PUBLISHED' });
    expect(published.status).toBe(200);
    expect(published.body.data.publishedAt).toEqual(expect.any(String));
    expect((await createClient().get('/api/v1/games/sudoku')).body.data.playable).toBe(true);

    await client.patch(`/api/v1/admin/games/${sudoku}`, { status: 'UNPUBLISHED' });
    expect((await createClient().get('/api/v1/games/sudoku')).status).toBe(404);
    expect(await prisma.auditLog.count({ where: { action: 'admin.game_published' } })).toBe(1);
  });

  it('deletes only unpublished games without history', async () => {
    const { client } = await as('ADMIN');
    expect((await client.del(`/api/v1/admin/games/${await gameId('snake')}`)).status).toBe(409);
    const { client: player } = await as('USER');
    await player.post('/api/v1/games/planned-game/reports', { reason: 'OTHER', details: 'When will this be released?' });
    expect((await client.del(`/api/v1/admin/games/${await gameId('planned-game')}`)).status).toBe(409);
    const created = await client.post('/api/v1/admin/games', newGame);
    expect((await client.del(`/api/v1/admin/games/${created.body.data.id}`)).status).toBe(204);
    expect(await prisma.game.count({ where: { slug: 'star-forge' } })).toBe(0);
  });

  it('uploads thumbnails as responsive WebP variants', async () => {
    const { client } = await as('ADMIN');
    const id = await gameId('snake');
    const image = await sharp({ create: { width: 1280, height: 800, channels: 3, background: '#7c5cff' } }).jpeg().toBuffer();
    const res = await client.upload(`/api/v1/admin/games/${id}/thumbnail`, image, 'image/jpeg');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.thumbnailUrl).toMatch(/\/640\.webp$/);
    const publicGame = (await createClient().get('/api/v1/games/snake')).body.data;
    expect(publicGame.thumbnailSrcSet.split(', ').map((s: string) => s.split(' ')[1])).toEqual(['320w', '640w', '960w']);
    for (const width of [320, 640, 960]) {
      const variant = await createClient().get(publicGame.thumbnailUrl.replace('/640.webp', `/${width}.webp`));
      expect(variant.status).toBe(200);
      expect((await sharp(variant.body as Buffer).metadata()).width).toBe(width);
    }
    expect((await client.upload(`/api/v1/admin/games/${id}/thumbnail`, Buffer.from('nope'))).status).toBe(415);
    expect((await client.del(`/api/v1/admin/games/${id}/thumbnail`)).body.data.thumbnailUrl).toBeNull();
    expect(await prisma.mediaImage.count()).toBe(0);
  });
});

describe('category management', () => {
  it('creates, updates and deletes categories with safeguards', async () => {
    const { client } = await as('ADMIN');
    const body = { slug: 'rhythm', name: 'Rhythm', description: 'Games about timing and beat.', icon: 'Sparkles', accentColor: '#ff00aa', sortOrder: 50 };
    const created = await client.post('/api/v1/admin/categories', body);
    expect(created.status).toBe(201);
    expect((await client.post('/api/v1/admin/categories', body)).status).toBe(409);
    expect((await client.post('/api/v1/admin/categories', { ...body, slug: 'bad', icon: 'NotAnIcon' })).status).toBe(400);
    expect((await client.patch(`/api/v1/admin/categories/${created.body.data.id}`, { name: 'Rhythm & Beat' })).body.data.name).toBe('Rhythm & Beat');

    const arcade = await prisma.gameCategory.findUniqueOrThrow({ where: { slug: 'arcade' } });
    expect((await client.del(`/api/v1/admin/categories/${arcade.id}`)).status).toBe(409);
    expect((await client.del(`/api/v1/admin/categories/${created.body.data.id}`)).status).toBe(204);
  });
});

describe('reports', () => {
  it('lets moderators review and resolve reports, notifying the reporter', async () => {
    const { user: reporter, client: player } = await as('USER');
    await player.post('/api/v1/games/snake/reports', { reason: 'BROKEN', details: 'The snake goes through walls.' });
    const { client: mod } = await as('MODERATOR');
    const list = await mod.get('/api/v1/admin/reports?status=open');
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ reason: 'BROKEN', game: { slug: 'snake' }, reporter: { id: reporter.id } });

    const res = await mod.patch(`/api/v1/admin/reports/${list.body.data[0].id}`, { status: 'RESOLVED', resolutionNote: 'Fixed in the latest version.' });
    expect(res.body.data).toMatchObject({ status: 'RESOLVED', resolutionNote: 'Fixed in the latest version.', resolvedBy: { displayName: 'moderator account' } });
    const note = await prisma.notification.findFirstOrThrow({ where: { userId: reporter.id } });
    expect(note).toMatchObject({ type: 'MODERATION', body: 'Fixed in the latest version.' });
    expect(await prisma.auditLog.count({ where: { action: 'admin.report_updated' } })).toBe(1);
  });
});

describe('achievement and challenge configuration', () => {
  it('validates criteria and protects achievements players have unlocked', async () => {
    const { client } = await as('ADMIN');
    const base = { key: 'sudoku-win', name: 'Sudoku Win', description: 'Solve a Sudoku puzzle.', icon: 'Brain', xpReward: 50 };
    expect((await client.post('/api/v1/admin/achievements', { ...base, criteria: { type: 'wins', count: 0 } })).status).toBe(400);
    expect((await client.post('/api/v1/admin/achievements', { ...base, criteria: { type: 'wins', count: 1, game: 'no-such-game' } })).status).toBe(400);
    const created = await client.post('/api/v1/admin/achievements', { ...base, criteria: { type: 'wins', count: 1, game: 'sudoku' } });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ key: 'sudoku-win', game: { slug: 'sudoku' }, isActive: true });

    const id = created.body.data.id;
    await client.patch(`/api/v1/admin/achievements/${id}`, { isActive: false });
    expect((await createClient().get('/api/v1/achievements')).body.data).toEqual([]);

    const { user } = await as('USER');
    await prisma.userAchievement.create({ data: { userId: user.id, achievementId: id } });
    expect((await client.del(`/api/v1/admin/achievements/${id}`)).status).toBe(409);
    await prisma.userAchievement.deleteMany();
    expect((await client.del(`/api/v1/admin/achievements/${id}`)).status).toBe(204);
  });

  it('schedules daily challenges and protects completed ones', async () => {
    const { client } = await as('ADMIN');
    const base = { date: '2030-05-01', title: 'Snake sprint', description: 'Score 500 in Snake.', type: 'REACH_SCORE', target: 500, xpReward: 40 };
    expect((await client.post('/api/v1/admin/challenges', base)).status).toBe(400);
    const created = await client.post('/api/v1/admin/challenges', { ...base, game: 'snake' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ date: '2030-05-01', game: { slug: 'snake' }, completions: 0 });

    const listed = await client.get('/api/v1/admin/challenges?from=2030-04-30&to=2030-05-02');
    expect(listed.body.data.map((c: { id: string }) => c.id)).toEqual([created.body.data.id]);
    const updated = await client.patch(`/api/v1/admin/challenges/${created.body.data.id}`, { target: 750 });
    expect(updated.body.data.target).toBe(750);

    const { user } = await as('USER');
    await prisma.userChallengeProgress.create({ data: { userId: user.id, challengeId: created.body.data.id, progress: 750, completedAt: new Date() } });
    expect((await client.del(`/api/v1/admin/challenges/${created.body.data.id}`)).status).toBe(409);
  });
});

describe('audit log', () => {
  it('filters security-relevant events', async () => {
    const { client } = await as('ADMIN');
    const target = await createUser();
    await client.patch(`/api/v1/admin/users/${target.id}/status`, { status: 'SUSPENDED', reason: 'Audit log test' });
    const res = await client.get(`/api/v1/admin/audit-logs?action=admin.&targetId=${target.id}`);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ action: 'admin.user_suspended', actor: { displayName: 'admin account' } });
    const logins = await client.get('/api/v1/admin/audit-logs?action=auth.login&pageSize=1');
    expect(logins.body.meta.total).toBeGreaterThanOrEqual(1);
    expect((await client.get('/api/v1/admin/audit-logs?from=not-a-date')).status).toBe(400);
  });
});

