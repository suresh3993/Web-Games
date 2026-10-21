import { describe, expect, it } from 'vitest';
import { flattenZodError, listGamesQuerySchema, loginSchema, registerSchema } from './index';

describe('registerSchema', () => {
  it('normalises email casing and whitespace', () => {
    const parsed = registerSchema.parse({
      displayName: '  Pixel Pilot ',
      email: '  Player@Example.COM ',
      password: 'correct horse battery',
    });
    expect(parsed.email).toBe('player@example.com');
    expect(parsed.displayName).toBe('Pixel Pilot');
  });

  it('rejects short passwords and invalid display names with field errors', () => {
    const result = registerSchema.safeParse({ displayName: '<b>', email: 'nope', password: 'short' });
    expect(result.success).toBe(false);
    if (result.success) return;
    const fields = flattenZodError(result.error);
    expect(Object.keys(fields).sort()).toEqual(['displayName', 'email', 'password']);
  });

  it('rejects passwords over the maximum length (bounds hashing cost)', () => {
    const result = registerSchema.safeParse({
      displayName: 'Player',
      email: 'p@example.com',
      password: 'a'.repeat(129),
    });
    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('does not apply the creation length policy to existing passwords', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
  });
});

describe('listGamesQuerySchema', () => {
  it('applies defaults', () => {
    expect(listGamesQuerySchema.parse({})).toEqual({ sort: 'popular', page: 1, pageSize: 24 });
  });

  it('parses comma-separated and repeated enum filters case-insensitively', () => {
    const parsed = listGamesQuerySchema.parse({ difficulty: 'easy,Hard', device: ['mobile'], status: 'published' });
    expect(parsed.difficulty).toEqual(['EASY', 'HARD']);
    expect(parsed.device).toEqual(['MOBILE']);
    expect(parsed.status).toBe('PUBLISHED');
  });

  it('rejects unknown enum values, oversize pages and non-public statuses', () => {
    expect(listGamesQuerySchema.safeParse({ difficulty: 'impossible' }).success).toBe(false);
    expect(listGamesQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
    expect(listGamesQuerySchema.safeParse({ status: 'DRAFT' }).success).toBe(false);
  });
});
