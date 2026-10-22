import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCsrfToken } from '@/lib/api';
import { mockApi, renderRoutes, testUser } from '@/test/render';
import { AdminLayout } from './admin-layout';

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  resetCsrfToken();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const routes = [
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <p>Dashboard content</p> },
      { path: 'audit-log', element: <p>Audit content</p> },
    ],
  },
];

describe('AdminLayout (client-side gate; the API enforces the same rules)', () => {
  it('asks guests to sign in', async () => {
    mockApi(fetchMock, null);
    renderRoutes(routes, '/admin');
    expect(await screen.findByText('Staff sign-in required')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard content')).not.toBeInTheDocument();
  });

  it('turns players away', async () => {
    mockApi(fetchMock, testUser({ role: 'USER' }));
    renderRoutes(routes, '/admin');
    expect(await screen.findByText('You don’t have access to this page')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard content')).not.toBeInTheDocument();
  });

  it('shows moderators their sections only', async () => {
    mockApi(fetchMock, testUser({ role: 'MODERATOR' }));
    renderRoutes(routes, '/admin');
    expect(await screen.findByText('Dashboard content')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Admin' });
    expect(nav).toHaveTextContent('Users');
    expect(nav).not.toHaveTextContent('Audit log');
  });

  it('blocks moderators from admin-only sections', async () => {
    mockApi(fetchMock, testUser({ role: 'MODERATOR' }));
    renderRoutes(routes, '/admin/audit-log');
    expect(await screen.findByText('This section is for administrators.')).toBeInTheDocument();
    expect(screen.queryByText('Audit content')).not.toBeInTheDocument();
  });

  it('gives admins everything', async () => {
    mockApi(fetchMock, testUser({ role: 'ADMIN' }));
    renderRoutes(routes, '/admin/audit-log');
    expect(await screen.findByText('Audit content')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Admin' })).toHaveTextContent('Audit log');
  });
});
