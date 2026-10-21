import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createClient, prisma, resetDatabase, seedCatalog } from './helpers';

beforeEach(async () => {
  await resetDatabase();
  await seedCatalog([
    { slug: 'snake', title: 'Snake', category: 'arcade', status: 'PUBLISHED', runtimeKey: 'snake', featured: true, playCount: 50 },
    { slug: 'brick-breaker', title: 'Brick Breaker', category: 'arcade', difficulty: 'MEDIUM', featured: true, playCount: 10 },
    { slug: 'sudoku', title: 'Sudoku', category: 'logic', extraCategories: ['puzzle'], difficulty: 'HARD', playCount: 30 },
    { slug: 'typing-challenge', title: 'Typing Challenge', category: 'word', devices: ['DESKTOP'], difficulty: 'MEDIUM' },
    { slug: 'published-no-runtime', title: 'Published Without Runtime', category: 'puzzle', status: 'PUBLISHED' },
    { slug: 'secret-draft', title: 'Secret Draft', category: 'arcade', status: 'DRAFT', featured: true },
    { slug: 'pulled-game', title: 'Pulled Game', category: 'arcade', status: 'UNPUBLISHED' },
  ]);
});
afterAll(() => prisma.$disconnect());

const slugs = (body: { data: { slug: string }[] }) => body.data.map((g) => g.slug);

describe('GET /games', () => {
  it('lists only public games, sorted by popularity, with pagination meta', async () => {
    const res = await createClient().get('/api/v1/games');
    expect(res.status).toBe(200);
    expect(slugs(res.body)).toEqual(['snake', 'sudoku', 'brick-breaker', 'published-no-runtime', 'typing-challenge']);
    expect(res.body.meta).toEqual({ page: 1, pageSize: 24, total: 5, totalPages: 1 });
    expect(res.headers['cache-control']).toMatch(/public/);
  });

  it('paginates', async () => {
    const res = await createClient().get('/api/v1/games?pageSize=2&page=2&sort=title');
    // Titles: Brick Breaker, Published Without Runtime | Snake, Sudoku | Typing Challenge
    expect(slugs(res.body)).toEqual(['snake', 'sudoku']);
    expect(res.body.meta).toMatchObject({ page: 2, total: 5, totalPages: 3 });
  });

  it('searches titles case-insensitively', async () => {
    expect(slugs((await createClient().get('/api/v1/games?q=SNA')).body)).toEqual(['snake']);
  });

  it('filters by category (including secondary categories), difficulty, device and status', async () => {
    const client = createClient();
    expect(slugs((await client.get('/api/v1/games?category=puzzle&sort=title')).body)).toEqual(['published-no-runtime', 'sudoku']);
    expect(slugs((await client.get('/api/v1/games?difficulty=medium,hard&sort=title')).body)).toEqual([
      'brick-breaker',
      'sudoku',
      'typing-challenge',
    ]);
    expect(slugs((await client.get('/api/v1/games?device=MOBILE&category=word')).body)).toEqual([]);
    expect(slugs((await client.get('/api/v1/games?status=PUBLISHED&sort=title')).body)).toEqual(['published-no-runtime', 'snake']);
  });

  it('never exposes drafts or unpublished games, even when asked', async () => {
    const res = await createClient().get('/api/v1/games?status=DRAFT');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('marks a game playable only when published with a runtime', async () => {
    const res = await createClient().get('/api/v1/games?sort=title');
    const playable = Object.fromEntries(res.body.data.map((g: { slug: string; playable: boolean }) => [g.slug, g.playable]));
    expect(playable).toEqual({
      'brick-breaker': false,
      'published-no-runtime': false,
      snake: true,
      sudoku: false,
      'typing-challenge': false,
    });
  });

  it('validates query parameters', async () => {
    const res = await createClient().get('/api/v1/games?pageSize=1000&sort=random');
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['pageSize', 'sort']);
  });
});

describe('catalog endpoints', () => {
  it('returns featured public games with playable games first', async () => {
    const res = await createClient().get('/api/v1/games/featured');
    expect(slugs(res.body)).toEqual(['snake', 'brick-breaker']);
  });

  it('returns trending games (falls back to popularity when there are no recent sessions)', async () => {
    const res = await createClient().get('/api/v1/games/trending');
    expect(res.status).toBe(200);
    expect(slugs(res.body)[0]).toBe('snake');
    expect(slugs(res.body)).not.toContain('secret-draft');
  });

  it('returns categories with counts of public games only', async () => {
    const res = await createClient().get('/api/v1/games/categories');
    const counts = Object.fromEntries(res.body.data.map((c: { slug: string; gameCount: number }) => [c.slug, c.gameCount]));
    expect(counts).toEqual({ arcade: 2, logic: 1, puzzle: 2, word: 1 });
  });

  it('returns game details by slug, including all categories', async () => {
    const res = await createClient().get('/api/v1/games/sudoku');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      slug: 'sudoku',
      title: 'Sudoku',
      instructions: 'How to play sudoku',
      status: 'COMING_SOON',
      playable: false,
      primaryCategory: { slug: 'logic' },
    });
    expect(res.body.data.categories.map((c: { slug: string }) => c.slug).sort()).toEqual(['logic', 'puzzle']);
    // The player needs the module key; internal bookkeeping stays private.
    expect(res.body.data.runtimeKey).toBeNull();
    for (const field of ['maxScore', 'playCount', 'externalUrl', 'roadmapBatch', 'licenseNotes']) {
      expect(res.body.data, field).not.toHaveProperty(field);
    }
    const snake = await createClient().get('/api/v1/games/snake');
    expect(snake.body.data.runtimeKey).toBe('snake');
  });

  it('returns 404 for drafts and unknown games, and 400 for malformed slugs', async () => {
    const client = createClient();
    expect((await client.get('/api/v1/games/secret-draft')).status).toBe(404);
    expect((await client.get('/api/v1/games/does-not-exist')).status).toBe(404);
    expect((await client.get('/api/v1/games/Bad_Slug!')).status).toBe(400);
  });

  it('returns related games from the same category, excluding the game itself and hidden games', async () => {
    const res = await createClient().get('/api/v1/games/snake/related');
    expect(slugs(res.body)).toEqual(['brick-breaker']);
  });
});

describe('system', () => {
  it('reports health', async () => {
    const res = await createClient().get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.data.checks).toEqual({ database: 'ok', redis: 'disabled' });
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await createClient().get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects malformed JSON bodies cleanly', async () => {
    const client = createClient();
    const token = await client.csrf();
    const res = await client.agent
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', token)
      .set('Content-Type', 'application/json')
      .send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('sends security headers', async () => {
    const res = await createClient().get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('serves the OpenAPI document', async () => {
    const res = await createClient().get('/api/v1/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(res.body.paths['/auth/register'].post.requestBody.content['application/json'].schema.properties).toHaveProperty('email');
  });
});
