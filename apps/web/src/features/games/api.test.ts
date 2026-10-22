import { describe, expect, it } from 'vitest';
import { exploreQuery, gameKeys } from './api';

describe('exploreQuery', () => {
  it('reads filters, sort and page from the URL', () => {
    const query = exploreQuery(new URLSearchParams('q=chess&category=board&difficulty=EASY,HARD&device=MOBILE&status=PUBLISHED&sort=newest&page=3'));
    expect(query).toEqual({
      q: 'chess',
      category: 'board',
      difficulty: ['EASY', 'HARD'],
      device: ['MOBILE'],
      status: 'PUBLISHED',
      sort: 'newest',
      page: 3,
      pageSize: 24,
    });
  });

  it('falls back to safe defaults for missing or invalid values', () => {
    expect(exploreQuery(new URLSearchParams('status=DRAFT&sort=evil&page=-2'))).toEqual({
      q: undefined,
      category: undefined,
      difficulty: [],
      device: [],
      status: undefined,
      sort: 'popular',
      page: 1,
      pageSize: 24,
    });
  });

  it('gives the same cache key for the same URL, so the router prefetch is reused by the page', () => {
    const a = gameKeys.list(exploreQuery(new URLSearchParams('sort=title&q=snake')));
    const b = gameKeys.list(exploreQuery(new URLSearchParams('q=snake&sort=title')));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
