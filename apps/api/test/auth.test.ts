import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { hashToken } from '../src/lib/crypto';
import {
  createClient,
  createUser,
  DEFAULT_PASSWORD,
  lastEmailTo,
  loginAs,
  outbox,
  prisma,
  resetDatabase,
  tokenFromEmail,
} from './helpers';

const REGISTER = { displayName: 'Nova', email: 'Nova@Example.com', password: 'super secret password' };

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe('CSRF protection', () => {
  it('rejects state-changing requests without a CSRF token', async () => {
    const client = createClient();
    const res = await client.agent.post('/api/v1/auth/login').send({ email: 'a@b.co', password: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_INVALID');
  });

  it('rejects a token that does not match the cookie', async () => {
    const client = createClient();
    await client.csrf();
    const res = await client.agent.post('/api/v1/auth/login').set('X-CSRF-Token', 'x'.repeat(43)).send({});
    expect(res.status).toBe(403);
  });

  it('rejects requests from origins outside the allowlist', async () => {
    const client = createClient();
    const token = await client.csrf();
    const res = await client.agent
      .post('/api/v1/auth/login')
      .set('Origin', 'https://evil.example')
      .set('X-CSRF-Token', token)
      .send({ email: 'a@b.co', password: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_INVALID');
  });

  it('allows requests from an allowlisted origin and sets an HttpOnly CSRF cookie', async () => {
    const client = createClient();
    const csrfRes = await client.get('/api/v1/auth/csrf');
    expect(String(csrfRes.headers['set-cookie'])).toMatch(/pv_csrf=.*HttpOnly.*SameSite=Lax/i);
    const res = await client.agent
      .post('/api/v1/auth/forgot-password')
      .set('Origin', 'http://localhost:5173')
      .set('X-CSRF-Token', csrfRes.body.data.csrfToken)
      .send({ email: 'nobody@example.com' });
    expect(res.status).toBe(202);
  });
});

describe('registration', () => {
  it('creates an unverified user with an Argon2id hash and emails a verification link', async () => {
    const client = createClient();
    const res = await client.post('/api/v1/auth/register', REGISTER);
    expect(res.status).toBe(202);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'nova@example.com' } });
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.role).toBe('USER');
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(REGISTER.password);

    const token = await tokenFromEmail('nova@example.com', 'verify-email');
    // Only the hash of the token is stored.
    const stored = await prisma.authToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(stored.tokenHash).toBe(hashToken(token));
    expect(stored.tokenHash).not.toBe(token);
  });

  it('does not reveal whether an email is already registered', async () => {
    await createUser({ email: 'taken@example.com', displayName: 'Original' });
    const client = createClient();
    const fresh = await client.post('/api/v1/auth/register', { ...REGISTER, email: 'new@example.com' });
    const dup = await client.post('/api/v1/auth/register', { ...REGISTER, email: 'taken@example.com' });
    expect(dup.status).toBe(fresh.status);
    expect(dup.body).toEqual(fresh.body);
    expect(await prisma.user.count({ where: { email: 'taken@example.com' } })).toBe(1);
    expect((await lastEmailTo('taken@example.com')).subject).toMatch(/tried to register/i);
  });

  it('returns field-level validation errors', async () => {
    const client = createClient();
    const res = await client.post('/api/v1/auth/register', { displayName: 'x', email: 'bad', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['displayName', 'email', 'password']);
  });

  it('ignores attempts to self-assign a role', async () => {
    const client = createClient();
    await client.post('/api/v1/auth/register', { ...REGISTER, role: 'ADMIN' });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'nova@example.com' } });
    expect(user.role).toBe('USER');
  });
});

describe('email verification', () => {
  it('verifies with a valid token exactly once', async () => {
    const client = createClient();
    await client.post('/api/v1/auth/register', REGISTER);
    const token = await tokenFromEmail('nova@example.com', 'verify-email');

    const ok = await client.post('/api/v1/auth/verify-email', { token });
    expect(ok.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: 'nova@example.com' } })).emailVerifiedAt).not.toBeNull();

    const replay = await client.post('/api/v1/auth/verify-email', { token });
    expect(replay.status).toBe(400);
    expect(replay.body.error.code).toBe('TOKEN_INVALID');
  });

  it('rejects expired and unknown tokens', async () => {
    const client = createClient();
    await client.post('/api/v1/auth/register', REGISTER);
    const token = await tokenFromEmail('nova@example.com', 'verify-email');
    await prisma.authToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    expect((await client.post('/api/v1/auth/verify-email', { token })).body.error.code).toBe('TOKEN_INVALID');
    expect((await client.post('/api/v1/auth/verify-email', { token: 'A'.repeat(43) })).status).toBe(400);
  });

  it('resending invalidates the previous link and requires login', async () => {
    const user = await createUser({ email: 'unverified@example.com', verified: false });
    const anon = createClient();
    expect((await anon.post('/api/v1/auth/resend-verification')).status).toBe(401);

    const client = createClient();
    await loginAs(client, user.email);
    expect((await client.post('/api/v1/auth/resend-verification')).status).toBe(202);
    const first = await tokenFromEmail(user.email, 'verify-email');
    await client.post('/api/v1/auth/resend-verification');
    const second = await tokenFromEmail(user.email, 'verify-email');
    expect(second).not.toBe(first);

    expect((await client.post('/api/v1/auth/verify-email', { token: first })).status).toBe(400);
    expect((await client.post('/api/v1/auth/verify-email', { token: second })).status).toBe(200);
    expect((await client.post('/api/v1/auth/resend-verification')).status).toBe(409);
  });
});

describe('login, sessions and logout', () => {
  it('logs in with an HttpOnly session cookie and returns the current user', async () => {
    const user = await createUser({ email: 'player@example.com' });
    const client = createClient();
    const res = await loginAs(client, 'PLAYER@example.com');

    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/pv_session=[A-Za-z0-9_-]{43}/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(res.body.data).toMatchObject({ id: user.id, email: 'player@example.com', role: 'USER', emailVerified: true });
    expect(res.body.data.passwordHash).toBeUndefined();

    const me = await client.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.id).toBe(user.id);

    // The raw cookie token is never stored.
    const raw = cookie.match(/pv_session=([A-Za-z0-9_-]{43})/)![1]!;
    const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.tokenHash).toBe(hashToken(raw));
  });

  it('uses the same generic error for unknown emails and wrong passwords', async () => {
    await createUser({ email: 'player@example.com' });
    const client = createClient();
    const wrong = await client.post('/api/v1/auth/login', { email: 'player@example.com', password: 'wrong password!' });
    const unknown = await client.post('/api/v1/auth/login', { email: 'ghost@example.com', password: 'wrong password!' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('logout revokes the session server-side', async () => {
    await createUser({ email: 'player@example.com' });
    const client = createClient();
    const login = await loginAs(client, 'player@example.com');
    const sessionCookie = String(login.headers['set-cookie']).match(/pv_session=[^;]+/)![0];

    expect((await client.post('/api/v1/auth/logout')).status).toBe(204);
    expect((await client.get('/api/v1/auth/me')).status).toBe(401);
    expect(await prisma.session.count()).toBe(0);

    // Replaying the old cookie value does not work either.
    const replay = await createClient().agent.get('/api/v1/auth/me').set('Cookie', sessionCookie);
    expect(replay.status).toBe(401);
  });

  it('rejects expired sessions', async () => {
    await createUser({ email: 'player@example.com' });
    const client = createClient();
    await loginAs(client, 'player@example.com');
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await client.get('/api/v1/auth/me')).status).toBe(401);
    expect(await prisma.session.count()).toBe(0);
  });

  it('logout-all revokes every session for the user', async () => {
    await createUser({ email: 'player@example.com' });
    const laptop = createClient();
    const phone = createClient();
    await loginAs(laptop, 'player@example.com');
    await loginAs(phone, 'player@example.com');
    expect(await prisma.session.count()).toBe(2);
    expect((await laptop.post('/api/v1/auth/logout-all')).status).toBe(204);
    expect((await phone.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('blocks suspended accounts, including their existing sessions', async () => {
    const user = await createUser({ email: 'player@example.com' });
    const client = createClient();
    await loginAs(client, 'player@example.com');
    await prisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });

    expect((await client.get('/api/v1/auth/me')).status).toBe(401);
    const relogin = await client.post('/api/v1/auth/login', { email: 'player@example.com', password: DEFAULT_PASSWORD });
    expect(relogin.status).toBe(403);
    expect(relogin.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('rate-limits repeated failed logins for one account', async () => {
    await createUser({ email: 'target@example.com' });
    const client = createClient();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      statuses.push((await client.post('/api/v1/auth/login', { email: 'target@example.com', password: `guess-${i}-xxxx` })).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('writes audit log entries for security events', async () => {
    await createUser({ email: 'player@example.com' });
    const client = createClient();
    await client.post('/api/v1/auth/login', { email: 'player@example.com', password: 'wrong password!' });
    await loginAs(client, 'player@example.com');
    const actions = (await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } })).map((a) => a.action);
    expect(actions).toEqual(['auth.login_failed', 'auth.login']);
  });
});

describe('password reset', () => {
  it('does not reveal unknown emails and sends nothing for them', async () => {
    const client = createClient();
    const res = await client.post('/api/v1/auth/forgot-password', { email: 'ghost@example.com' });
    expect(res.status).toBe(202);
    expect(outbox).toHaveLength(0);
  });

  it('resets the password with a single-use token and revokes all sessions', async () => {
    await createUser({ email: 'player@example.com' });
    const existing = createClient();
    await loginAs(existing, 'player@example.com');

    const client = createClient();
    expect((await client.post('/api/v1/auth/forgot-password', { email: 'player@example.com' })).status).toBe(202);
    const token = await tokenFromEmail('player@example.com', 'reset-password');

    const weak = await client.post('/api/v1/auth/reset-password', { token, password: 'short' });
    expect(weak.status).toBe(400);

    const ok = await client.post('/api/v1/auth/reset-password', { token, password: 'a brand new passphrase' });
    expect(ok.status).toBe(200);

    expect((await existing.get('/api/v1/auth/me')).status).toBe(401);
    expect((await client.post('/api/v1/auth/reset-password', { token, password: 'another new passphrase' })).status).toBe(400);
    expect((await client.post('/api/v1/auth/login', { email: 'player@example.com', password: DEFAULT_PASSWORD })).status).toBe(401);
    expect((await client.post('/api/v1/auth/login', { email: 'player@example.com', password: 'a brand new passphrase' })).status).toBe(200);
    expect((await lastEmailTo('player@example.com')).subject).toMatch(/password was changed/i);
  });

  it('rejects expired reset tokens and invalidates older links when a new one is requested', async () => {
    await createUser({ email: 'player@example.com' });
    const client = createClient();
    await client.post('/api/v1/auth/forgot-password', { email: 'player@example.com' });
    const first = await tokenFromEmail('player@example.com', 'reset-password');
    await client.post('/api/v1/auth/forgot-password', { email: 'player@example.com' });
    const second = await tokenFromEmail('player@example.com', 'reset-password');

    expect((await client.post('/api/v1/auth/reset-password', { token: first, password: 'a brand new passphrase' })).status).toBe(400);
    await prisma.authToken.updateMany({ where: { usedAt: null }, data: { expiresAt: new Date(Date.now() - 1) } });
    expect((await client.post('/api/v1/auth/reset-password', { token: second, password: 'a brand new passphrase' })).status).toBe(400);
  });

  it('cannot use a verification token as a reset token', async () => {
    const client = createClient();
    await client.post('/api/v1/auth/register', REGISTER);
    const verifyToken = await tokenFromEmail('nova@example.com', 'verify-email');
    const res = await client.post('/api/v1/auth/reset-password', { token: verifyToken, password: 'a brand new passphrase' });
    expect(res.status).toBe(400);
  });
});
