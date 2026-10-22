import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { vi } from 'vitest';
import type { CurrentUser } from '@suresh/shared-types';

export const json = (status: number, body: unknown) =>
  status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const testUser = (overrides: Partial<CurrentUser> = {}): CurrentUser => ({
  id: 'cuser000000000000000001',
  email: 'player@example.com',
  emailVerified: true,
  displayName: 'Pixel Pilot',
  avatarUrl: null,
  role: 'USER',
  xp: 40,
  level: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

type Handler = (url: URL, init: RequestInit | undefined) => Response | Promise<Response> | undefined;

/**
 * Routes fetch calls by "METHOD /path" to handlers; unknown calls fail loudly.
 * `user` answers GET /auth/session (null = logged out); CSRF is always available.
 */
export function mockApi(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, user: CurrentUser | null, routes: Record<string, Handler | unknown> = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const route = `${init?.method ?? 'GET'} ${url.pathname.replace(/^\/api\/v1/, '')}`;
    if (route === 'GET /auth/session') return json(200, { data: user });
    if (route === 'GET /auth/csrf') return json(200, { data: { csrfToken: 'csrf' } });
    if (route in routes) {
      const handler = routes[route];
      if (typeof handler === 'function') {
        const res = await (handler as Handler)(url, init);
        if (res) return res;
      } else return json(200, { data: handler });
    }
    return json(404, { error: { code: 'NOT_FOUND', message: `unexpected ${route}` } });
  });
}

export function renderRoutes(routes: RouteObject[], path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([...routes, { path: '*', element: <p>Elsewhere</p> }], { initialEntries: [path] });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}
