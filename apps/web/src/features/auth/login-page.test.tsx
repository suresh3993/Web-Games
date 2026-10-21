import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCsrfToken } from '@/lib/api';
import { LoginPage } from './login-page';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function renderLogin(initialPath = '/login') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginPage /> },
      { path: '*', element: <p>Landed on {'target'}</p> },
    ],
    { initialEntries: [initialPath] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('LoginPage', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    resetCsrfToken();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('validates on the client before calling the API', async () => {
    fetchMock.mockResolvedValue(json(401, { error: { code: 'UNAUTHENTICATED', message: 'no' } }));
    const user = userEvent.setup();
    renderLogin();
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(fetchMock.mock.calls.every(([url]) => String(url).endsWith('/auth/me'))).toBe(true);
  });

  it('shows the server error message on invalid credentials', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return json(401, { error: { code: 'UNAUTHENTICATED', message: 'no' } });
      if (url.endsWith('/auth/csrf')) return json(200, { data: { csrfToken: 't' } });
      return json(401, { error: { code: 'UNAUTHENTICATED', message: 'Invalid email or password.' } });
    });
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText('Email'), 'player@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('redirects to a safe ?next= target after logging in, ignoring external URLs', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return json(401, { error: { code: 'UNAUTHENTICATED', message: 'no' } });
      if (url.endsWith('/auth/csrf')) return json(200, { data: { csrfToken: 't' } });
      return json(200, { data: { id: 'u1', displayName: 'Nova', email: 'n@e.com', emailVerified: true, role: 'USER', xp: 0, level: 1, avatarUrl: null, createdAt: '' } });
    });
    const user = userEvent.setup();
    const router = renderLogin('/login?next=https://evil.example');
    await user.type(screen.getByLabelText('Email'), 'n@e.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });
});
