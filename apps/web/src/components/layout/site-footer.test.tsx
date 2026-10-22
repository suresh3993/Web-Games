import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderRoutes, testUser } from '@/test/render';
import { SiteFooter } from './site-footer';

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const accountLinks = () =>
  within(screen.getByRole('navigation', { name: 'Account' }))
    .getAllByRole('link')
    .map((link) => link.getAttribute('href'));

describe('SiteFooter', () => {
  it('offers sign-up and log-in links to guests', async () => {
    mockApi(fetchMock, null);
    renderRoutes([{ path: '/', element: <SiteFooter /> }], '/');
    expect(await screen.findByRole('link', { name: 'Create account' })).toBeInTheDocument();
    expect(accountLinks()).toEqual(['/register', '/login', '/forgot-password']);
  });

  it('links signed-in players to their own pages instead', async () => {
    mockApi(fetchMock, testUser());
    renderRoutes([{ path: '/', element: <SiteFooter /> }], '/');
    expect(await screen.findByRole('link', { name: 'Your profile' })).toBeInTheDocument();
    expect(accountLinks()).toEqual(['/profile', '/achievements', '/settings']);
  });
});
