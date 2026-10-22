import { createServer, type Server } from 'node:http';
import type { Express } from 'express';
import request from 'supertest';
import type { Difficulty, DeviceType, GameStatus } from '@suresh/shared-types';
import { createApp } from '../src/app';
import { prisma } from '../src/database/prisma';
import { invalidateCache } from '../src/lib/cache';
import { flushMail, outbox } from '../src/lib/mailer';
import { hashPassword } from '../src/modules/auth/password';
import { resetEnsuredDays } from '../src/modules/progression/challenges.service';

export { prisma, outbox };

/** Empties every application table (keeps the migrations table) and all in-memory state. */
export async function resetDatabase() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  }
  outbox.length = 0;
  await invalidateCache('');
  resetEnsuredDays();
}

const openServers = new Set<Server>();

/** Closes every server started by `createClient` (registered in test/setup.ts). */
export async function closeServers() {
  await Promise.all(
    [...openServers].map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
  openServers.clear();
}

/**
 * A supertest agent (cookie jar) bound to a fresh app instance (fresh rate-limit counters).
 * The server must already be listening when requests are built: supertest 7.3 "adopts" a
 * not-yet-listening server and closes it after the first request. `listen(0)` without a host
 * binds synchronously (with a host it waits on a DNS lookup).
 */
export function createClient(app: Express = createApp()) {
  const server = createServer(app).listen(0);
  openServers.add(server);
  const agent = request.agent(server);
  let csrfToken: string | null = null;

  async function csrf() {
    if (!csrfToken) {
      const res = await agent.get('/api/v1/auth/csrf').expect(200);
      csrfToken = res.body.data.csrfToken as string;
    }
    return csrfToken;
  }

  return {
    agent,
    app,
    csrf,
    get: (url: string) => agent.get(url),
    post: async (url: string, body?: object) => {
      // Fetch the token first: the agent attaches cookies when the request object is created.
      const token = await csrf();
      return agent.post(url).set('X-CSRF-Token', token).send(body ?? {});
    },
    patch: async (url: string, body?: object) => {
      const token = await csrf();
      return agent.patch(url).set('X-CSRF-Token', token).send(body ?? {});
    },
    del: async (url: string, body?: object) => {
      const token = await csrf();
      return agent.delete(url).set('X-CSRF-Token', token).send(body ?? {});
    },
    /** Raw-body upload (the API detects the real type from the bytes). */
    upload: async (url: string, bytes: Buffer, contentType = 'application/octet-stream') => {
      const token = await csrf();
      return agent.put(url).set('X-CSRF-Token', token).set('Content-Type', contentType).send(bytes);
    },
  };
}

export async function lastEmailTo(to: string) {
  await flushMail();
  const message = [...outbox].reverse().find((m) => m.to === to);
  if (!message) throw new Error(`No email sent to ${to}`);
  return message;
}

export async function tokenFromEmail(to: string, kind: 'verify-email' | 'reset-password') {
  const message = await lastEmailTo(to);
  const match = message.text.match(new RegExp(`/${kind}\\?token=([A-Za-z0-9_-]+)`));
  if (!match?.[1]) throw new Error(`No ${kind} link in email to ${to}`);
  return match[1];
}

export const DEFAULT_PASSWORD = 'correct horse battery staple';

export async function createUser(
  overrides: Partial<{ email: string; displayName: string; password: string; verified: boolean; role: 'USER' | 'MODERATOR' | 'ADMIN'; status: 'ACTIVE' | 'SUSPENDED' }> = {},
) {
  const email = overrides.email ?? `player${Math.random().toString(36).slice(2, 8)}@example.com`;
  return prisma.user.create({
    data: {
      email,
      displayName: overrides.displayName ?? 'Test Player',
      passwordHash: await hashPassword(overrides.password ?? DEFAULT_PASSWORD),
      emailVerifiedAt: overrides.verified === false ? null : new Date(),
      role: overrides.role ?? 'USER',
      status: overrides.status ?? 'ACTIVE',
    },
  });
}

export async function loginAs(client: ReturnType<typeof createClient>, email: string, password = DEFAULT_PASSWORD) {
  const res = await client.post('/api/v1/auth/login', { email, password });
  if (res.status !== 200) throw new Error(`Login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res;
}

interface GameFixture {
  slug: string;
  title?: string;
  status?: GameStatus;
  difficulty?: Difficulty;
  devices?: DeviceType[];
  runtimeKey?: string | null;
  maxScore?: number | null;
  supportsScores?: boolean;
  featured?: boolean;
  playCount?: number;
  category: string;
  extraCategories?: string[];
}

export async function seedCatalog(games: GameFixture[]) {
  const slugs = [...new Set(games.flatMap((g) => [g.category, ...(g.extraCategories ?? [])]))];
  const categories = new Map<string, string>();
  for (const [i, slug] of slugs.entries()) {
    const c = await prisma.gameCategory.create({
      data: { slug, name: slug[0]!.toUpperCase() + slug.slice(1), description: `${slug} games`, icon: 'Gamepad2', accentColor: '#7c5cff', sortOrder: i },
    });
    categories.set(slug, c.id);
  }
  for (const g of games) {
    await prisma.game.create({
      data: {
        slug: g.slug,
        title: g.title ?? g.slug.replace(/-/g, ' '),
        shortDescription: `About ${g.slug}`,
        description: `Long description of ${g.slug}`,
        instructions: `How to play ${g.slug}`,
        difficulty: g.difficulty ?? 'EASY',
        supportedDevices: g.devices ?? ['DESKTOP', 'TABLET', 'MOBILE'],
        estimatedMinutes: 5,
        engine: 'CANVAS',
        runtimeKey: g.runtimeKey ?? null,
        maxScore: g.maxScore ?? null,
        supportsScores: g.supportsScores ?? true,
        status: g.status ?? 'COMING_SOON',
        isFeatured: g.featured ?? false,
        playCount: g.playCount ?? 0,
        primaryCategoryId: categories.get(g.category)!,
        categories: {
          create: [g.category, ...(g.extraCategories ?? [])].map((slug) => ({ categoryId: categories.get(slug)! })),
        },
      },
    });
  }
  return categories;
}
