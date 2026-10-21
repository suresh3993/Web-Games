import cookieParser from 'cookie-parser';
import express from 'express';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { loadSession, requireAuth, requireRole, requireVerifiedEmail } from '../src/middleware/auth';
import { errorHandler } from '../src/middleware/error-handler';
import { createClient, createUser, loginAs, prisma, resetDatabase } from './helpers';
import { createApp } from '../src/app';

/**
 * Exercises the server-side guards that admin/moderator routes (Milestone 6) will use,
 * mounted on the real app so sessions and cookies behave exactly as in production.
 */
function appWithGuardedRoutes() {
  const guarded = express.Router();
  guarded.use(cookieParser(), loadSession);
  guarded.get('/member', requireAuth, (_req, res) => void res.json({ ok: true }));
  guarded.get('/verified', requireVerifiedEmail, (_req, res) => void res.json({ ok: true }));
  guarded.get('/moderation', requireRole('MODERATOR'), (_req, res) => void res.json({ ok: true }));
  guarded.get('/admin', requireRole('ADMIN'), (_req, res) => void res.json({ ok: true }));
  guarded.use(errorHandler);

  // Guarded test routes first, then the real application (login, CSRF, sessions).
  const outer = express();
  outer.use('/guarded', guarded);
  outer.use(createApp());
  return outer;
}

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe('role-based authorization', () => {
  it('returns 401 to anonymous users', async () => {
    const client = createClient(appWithGuardedRoutes());
    for (const path of ['/guarded/member', '/guarded/moderation', '/guarded/admin']) {
      const res = await client.get(path);
      expect(res.status, path).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('forbids regular users from moderator and admin routes', async () => {
    await createUser({ email: 'user@example.com' });
    const client = createClient(appWithGuardedRoutes());
    await loginAs(client, 'user@example.com');
    expect((await client.get('/guarded/member')).status).toBe(200);
    expect((await client.get('/guarded/moderation')).status).toBe(403);
    const admin = await client.get('/guarded/admin');
    expect(admin.status).toBe(403);
    expect(admin.body.error.code).toBe('FORBIDDEN');
  });

  it('lets moderators moderate but not administer', async () => {
    await createUser({ email: 'mod@example.com', role: 'MODERATOR' });
    const client = createClient(appWithGuardedRoutes());
    await loginAs(client, 'mod@example.com');
    expect((await client.get('/guarded/moderation')).status).toBe(200);
    expect((await client.get('/guarded/admin')).status).toBe(403);
  });

  it('lets admins access both', async () => {
    await createUser({ email: 'admin@example.com', role: 'ADMIN' });
    const client = createClient(appWithGuardedRoutes());
    await loginAs(client, 'admin@example.com');
    expect((await client.get('/guarded/moderation')).status).toBe(200);
    expect((await client.get('/guarded/admin')).status).toBe(200);
  });

  it('re-reads the role from the database on every request (demotion takes effect immediately)', async () => {
    const admin = await createUser({ email: 'admin@example.com', role: 'ADMIN' });
    const client = createClient(appWithGuardedRoutes());
    await loginAs(client, 'admin@example.com');
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'USER' } });
    expect((await client.get('/guarded/admin')).status).toBe(403);
  });

  it('requires a verified email where configured', async () => {
    await createUser({ email: 'new@example.com', verified: false });
    const client = createClient(appWithGuardedRoutes());
    await loginAs(client, 'new@example.com');
    expect((await client.get('/guarded/verified')).status).toBe(403);
  });
});
