import sharp from 'sharp';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createClient, createUser, DEFAULT_PASSWORD, lastEmailTo, loginAs, prisma, resetDatabase, seedCatalog } from './helpers';

beforeEach(async () => {
  await resetDatabase();
  await seedCatalog([{ slug: 'snake', title: 'Snake', category: 'arcade', status: 'PUBLISHED', runtimeKey: 'snake', maxScore: 10_000 }]);
});
afterAll(() => prisma.$disconnect());

async function player(options: Parameters<typeof createUser>[0] = {}) {
  const user = await createUser(options);
  const client = createClient();
  await loginAs(client, user.email);
  return { user, client };
}

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#7c5cff' } }).png().toBuffer();

describe('profile', () => {
  it('returns the profile with stats, and is private', async () => {
    const { client } = await player({ displayName: 'Pixel Pilot' });
    const res = await client.get('/api/v1/users/me');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toMatch(/no-store/);
    expect(res.body.data.user).toMatchObject({ displayName: 'Pixel Pilot', level: 1, xp: 0 });
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
    expect(res.body.data.stats).toMatchObject({ rounds: 0, gamesPlayed: 0, wins: 0, globalRank: null, levelStartXp: 0, nextLevelXp: 100 });
    expect((await createClient().get('/api/v1/users/me')).status).toBe(401);
  });

  it('updates the display name with validation and an audit entry', async () => {
    const { user, client } = await player();
    const ok = await client.patch('/api/v1/users/me', { displayName: '  New Name ' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.displayName).toBe('New Name');
    const bad = await client.patch('/api/v1/users/me', { displayName: '<script>' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields.displayName).toBeDefined();
    expect(await prisma.auditLog.count({ where: { action: 'user.profile_updated', actorId: user.id } })).toBe(1);
  });
});

describe('avatar uploads', () => {
  it('re-encodes a valid image to a 256 px WebP and serves it immutably', async () => {
    const { user, client } = await player();
    const res = await client.upload('/api/v1/users/me/avatar', await png(400, 300), 'image/png');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.avatarUrl).toMatch(/^\/api\/v1\/media\/c[a-z0-9]+\/256\.webp$/);

    const image = await createClient().get(res.body.data.avatarUrl);
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toBe('image/webp');
    expect(image.headers['cache-control']).toMatch(/immutable/);
    expect(image.headers['x-content-type-options']).toBe('nosniff');
    const meta = await sharp(image.body as Buffer).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 256, height: 256 });

    // Replacing deletes the previous image.
    const firstImageId = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).avatarImageId;
    await client.upload('/api/v1/users/me/avatar', await png(128, 128), 'image/png');
    expect(await prisma.mediaImage.count({ where: { id: firstImageId! } })).toBe(0);
    expect(await prisma.mediaImage.count()).toBe(1);
  });

  it('strips metadata such as EXIF from uploads', async () => {
    const { client } = await player();
    const jpeg = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#22d3ee' } })
      .jpeg()
      .withExif({ IFD0: { Copyright: 'SECRET-LOCATION-1234' } })
      .toBuffer();
    expect(jpeg.includes('SECRET-LOCATION-1234')).toBe(true);
    // The declared type is irrelevant; the bytes decide.
    const res = await client.upload('/api/v1/users/me/avatar', jpeg, 'application/octet-stream');
    expect(res.status).toBe(200);
    const served = (await createClient().get(res.body.data.avatarUrl)).body as Buffer;
    expect(served.includes('SECRET-LOCATION-1234')).toBe(false);
    expect((await sharp(served).metadata()).exif).toBeUndefined();
  });

  it('rejects files that are not images, SVG, oversize and tiny images', async () => {
    const { client } = await player();
    const cases: [Buffer, number][] = [
      [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'), 415],
      [Buffer.from('GIF89a but actually not an image at all'), 400],
      [Buffer.from('just text'), 415],
      [Buffer.alloc(0), 400],
      [await png(32, 32), 400],
      [Buffer.concat([await png(100, 100), Buffer.alloc(2 * 1024 * 1024)]), 413],
    ];
    for (const [bytes, status] of cases) {
      const res = await client.upload('/api/v1/users/me/avatar', bytes, 'image/png');
      expect(res.status, `${bytes.length} bytes`).toBe(status);
    }
    expect(await prisma.mediaImage.count()).toBe(0);
  });

  it('removes the avatar', async () => {
    const { client } = await player();
    await client.upload('/api/v1/users/me/avatar', await png(100, 100), 'image/png');
    const res = await client.del('/api/v1/users/me/avatar');
    expect(res.status).toBe(200);
    expect(res.body.data.avatarUrl).toBeNull();
    expect(await prisma.mediaImage.count()).toBe(0);
  });

  it('requires a CSRF token and a session', async () => {
    const { client } = await player();
    const noCsrf = await client.agent.put('/api/v1/users/me/avatar').set('Content-Type', 'image/png').send(await png(100, 100));
    expect(noCsrf.status).toBe(403);
    const anonymous = createClient();
    expect((await anonymous.upload('/api/v1/users/me/avatar', await png(100, 100))).status).toBe(401);
  });
});

describe('password change', () => {
  it('requires the current password, keeps this session and signs out the others', async () => {
    const { user, client } = await player();
    const other = createClient();
    await loginAs(other, user.email);

    const wrong = await client.post('/api/v1/users/me/password', { currentPassword: 'not my password', newPassword: 'a brand new passphrase' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.fields.currentPassword).toBeDefined();

    const ok = await client.post('/api/v1/users/me/password', { currentPassword: DEFAULT_PASSWORD, newPassword: 'a brand new passphrase' });
    expect(ok.status).toBe(204);
    expect((await client.get('/api/v1/auth/me')).status).toBe(200);
    expect((await other.get('/api/v1/auth/me')).status).toBe(401);
    expect((await lastEmailTo(user.email)).subject).toMatch(/password was changed/i);

    const fresh = createClient();
    expect((await fresh.post('/api/v1/auth/login', { email: user.email, password: DEFAULT_PASSWORD })).status).toBe(401);
    expect((await fresh.post('/api/v1/auth/login', { email: user.email, password: 'a brand new passphrase' })).status).toBe(200);
  });
});

describe('personal data export', () => {
  it('downloads every personal record as JSON without secrets', async () => {
    const { user, client } = await player({ displayName: 'Exporter' });
    await client.post('/api/v1/games/snake/favorite');
    const res = await client.get('/api/v1/users/me/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="suresh-data-\d{4}-\d{2}-\d{2}\.json"/);
    const data = JSON.parse(res.text);
    expect(data.account).toMatchObject({ id: user.id, email: user.email, displayName: 'Exporter' });
    expect(data.favorites).toEqual([expect.objectContaining({ game: 'snake' })]);
    expect(data.sessions.length).toBeGreaterThan(0);
    expect(res.text).not.toContain(user.passwordHash);
    expect(res.text).not.toMatch(/token_?hash|passwordHash/i);
    expect(await prisma.auditLog.count({ where: { action: 'user.data_exported', actorId: user.id } })).toBe(1);
  });
});

describe('account deletion', () => {
  it('needs the password, then deletes personal data and signs out', async () => {
    const { user, client } = await player();
    await client.post('/api/v1/games/snake/favorite');
    await client.post('/api/v1/games/snake/reports', { reason: 'BROKEN', details: 'Something is wrong with this game.' });
    await client.upload('/api/v1/users/me/avatar', await png(100, 100), 'image/png');

    const wrong = await client.del('/api/v1/users/me', { password: 'not my password' });
    expect(wrong.status).toBe(400);
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(1);

    const ok = await client.del('/api/v1/users/me', { password: DEFAULT_PASSWORD });
    expect(ok.status).toBe(204);
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(0);
    expect(await prisma.userFavorite.count()).toBe(0);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.mediaImage.count()).toBe(0);
    // Reports and the audit trail survive without the link to the person.
    expect(await prisma.gameReport.findFirstOrThrow()).toMatchObject({ reporterId: null });
    expect(await prisma.auditLog.findFirstOrThrow({ where: { action: 'user.deleted' } })).toMatchObject({ actorId: null, targetId: user.id });
    expect((await client.get('/api/v1/auth/me')).status).toBe(401);
    expect((await lastEmailTo(user.email)).subject).toMatch(/account was deleted/i);
  });

  it('does not let the only administrator delete their account', async () => {
    const { user, client } = await player({ role: 'ADMIN' });
    const res = await client.del('/api/v1/users/me', { password: DEFAULT_PASSWORD });
    expect(res.status).toBe(409);
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(1);
  });
});
