import { describe, expect, it } from 'vitest';
import { openApiDocument } from '../src/docs/openapi';

/** Every route the API serves, as "METHOD /path" in OpenAPI notation. Keep in sync with the routers. */
const ROUTES = [
  'get /health',
  'get /auth/csrf', 'post /auth/register', 'post /auth/login', 'post /auth/logout', 'post /auth/logout-all', 'post /auth/forgot-password',
  'post /auth/reset-password', 'post /auth/verify-email', 'post /auth/resend-verification', 'get /auth/me', 'get /auth/session',
  'get /games', 'get /games/featured', 'get /games/trending', 'get /games/categories', 'get /games/{slug}', 'get /games/{slug}/related',
  'get /games/{slug}/leaderboard', 'get /games/{slug}/me', 'post /games/{slug}/favorite', 'delete /games/{slug}/favorite', 'post /games/{slug}/reports',
  'post /game-sessions', 'patch /game-sessions/{id}', 'post /game-sessions/{id}/finish',
  'get /users/me', 'patch /users/me', 'delete /users/me', 'put /users/me/avatar', 'delete /users/me/avatar', 'post /users/me/password',
  'get /users/me/export', 'get /users/me/achievements', 'get /users/me/favorites', 'get /users/me/history',
  'get /leaderboards/global', 'get /achievements', 'get /challenges/daily', 'post /challenges/{id}/progress',
  'get /notifications', 'get /notifications/unread-count', 'post /notifications/{id}/read', 'post /notifications/read-all',
  'get /media/{id}/{file}',
  'get /admin/dashboard', 'get /admin/users', 'get /admin/users/{id}', 'patch /admin/users/{id}/status', 'patch /admin/users/{id}/role',
  'get /admin/reports', 'patch /admin/reports/{id}', 'get /admin/games', 'post /admin/games', 'get /admin/games/{id}', 'patch /admin/games/{id}',
  'delete /admin/games/{id}', 'put /admin/games/{id}/thumbnail', 'delete /admin/games/{id}/thumbnail', 'get /admin/categories', 'post /admin/categories',
  'patch /admin/categories/{id}', 'delete /admin/categories/{id}', 'get /admin/achievements', 'post /admin/achievements', 'patch /admin/achievements/{id}',
  'delete /admin/achievements/{id}', 'get /admin/challenges', 'post /admin/challenges', 'patch /admin/challenges/{id}', 'delete /admin/challenges/{id}',
  'get /admin/audit-logs',
];

describe('OpenAPI document', () => {
  it('documents every route', () => {
    const paths = openApiDocument.paths as Record<string, Record<string, unknown>>;
    const missing = ROUTES.filter((r) => {
      const [method, path] = r.split(' ') as [string, string];
      return !paths[path]?.[method];
    });
    expect(missing).toEqual([]);
  });

  it('marks state-changing operations with the CSRF header', () => {
    const paths = openApiDocument.paths as Record<string, Record<string, { parameters?: { name?: string }[] }>>;
    const unsafe = ROUTES.filter((r) => !r.startsWith('get ') && r !== 'post /auth/csrf');
    const withoutCsrf = unsafe.filter((r) => {
      const [method, path] = r.split(' ') as [string, string];
      return !paths[path]?.[method]?.parameters?.some((p) => p.name === 'X-CSRF-Token');
    });
    expect(withoutCsrf).toEqual([]);
  });
});
