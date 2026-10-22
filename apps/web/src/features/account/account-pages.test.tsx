import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCsrfToken } from '@/lib/api';
import { json, mockApi, renderRoutes, testUser } from '@/test/render';
import { NotificationBell } from './notification-bell';
import { EditProfilePage } from './profile-pages';
import { AchievementsPage } from './progress-pages';
import { SettingsPage } from './settings-page';

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  resetCsrfToken();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const calls = () => fetchMock.mock.calls.map(([input, init]) => `${init?.method ?? 'GET'} ${new URL(String(input), 'http://localhost').pathname}`);

describe('EditProfilePage', () => {
  it('checks avatar files in the browser before uploading', async () => {
    mockApi(fetchMock, testUser());
    const user = userEvent.setup({ applyAccept: false });
    renderRoutes([{ path: '/profile/edit', element: <EditProfilePage /> }], '/profile/edit');
    const input = await screen.findByLabelText('Choose an avatar image');

    await user.upload(input, new File(['<svg/>'], 'evil.svg', { type: 'image/svg+xml' }));
    expect(await screen.findByText('Choose a PNG, JPEG, WebP or GIF image.')).toBeInTheDocument();

    await user.upload(input, new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'huge.png', { type: 'image/png' }));
    expect(await screen.findByText('That image is larger than 2 MB.')).toBeInTheDocument();
    expect(calls().some((c) => c.includes('/users/me/avatar'))).toBe(false);
  });

  it('uploads a chosen image after preview', async () => {
    mockApi(fetchMock, testUser(), {
      'PUT /users/me/avatar': () => json(200, { data: testUser({ avatarUrl: '/api/v1/media/cimg000000000000000000001/256.webp' }) }),
    });
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
    const user = userEvent.setup();
    renderRoutes([{ path: '/profile/edit', element: <EditProfilePage /> }], '/profile/edit');
    await user.upload(await screen.findByLabelText('Choose an avatar image'), new File([new Uint8Array(10)], 'me.png', { type: 'image/png' }));
    expect(screen.getByAltText('New avatar preview')).toHaveAttribute('src', 'blob:preview');
    await user.click(screen.getByRole('button', { name: 'Save avatar' }));
    await waitFor(() => expect(calls()).toContain('PUT /api/v1/users/me/avatar'));
    const [, init] = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/users/me/avatar'))!;
    expect(init?.body).toBeInstanceOf(File);
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('image/png');
  });
});

describe('SettingsPage', () => {
  it('asks for the password before deleting the account and shows server errors', async () => {
    mockApi(fetchMock, testUser(), {
      'DELETE /users/me': () =>
        json(400, { error: { code: 'VALIDATION_ERROR', message: 'Your password is incorrect.', fields: { password: ['Your password is incorrect.'] } } }),
    });
    const user = userEvent.setup();
    renderRoutes([{ path: '/settings', element: <SettingsPage /> }], '/settings');
    await user.click(await screen.findByRole('button', { name: 'Delete my account' }));
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    expect(await screen.findByText('Enter your password to confirm')).toBeInTheDocument();
    expect(calls().some((c) => c.startsWith('DELETE'))).toBe(false);

    await user.type(screen.getByLabelText('Password', { selector: 'input' }), 'wrong password');
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    expect(await screen.findByText('Your password is incorrect.')).toBeInTheDocument();
  });

  it('asks guests to log in', async () => {
    mockApi(fetchMock, null);
    renderRoutes([{ path: '/settings', element: <SettingsPage /> }], '/settings');
    expect(await screen.findByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login?next=%2Fsettings');
  });
});

describe('AchievementsPage', () => {
  it('shows the public catalog to guests with a log-in prompt', async () => {
    mockApi(fetchMock, null, {
      'GET /achievements': [{ id: 'a1', key: 'first-round', name: 'First Steps', description: 'Finish your first round.', icon: 'Gamepad2', xpReward: 25, game: null, unlockedBy: 3 }],
    });
    renderRoutes([{ path: '/achievements', element: <AchievementsPage /> }], '/achievements');
    expect(await screen.findByText('First Steps')).toBeInTheDocument();
    expect(screen.getByText('3 players have this')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in to track progress' })).toBeInTheDocument();
    expect(calls()).not.toContain('GET /api/v1/users/me/achievements');
  });

  it('shows progress for signed-in players', async () => {
    mockApi(fetchMock, testUser(), {
      'GET /achievements': [],
      'GET /users/me/achievements': [
        { id: 'a1', key: 'first-round', name: 'First Steps', description: 'Finish your first round.', icon: 'Gamepad2', xpReward: 25, game: null, unlockedBy: 3, unlockedAt: '2026-10-01T00:00:00.000Z', progress: { current: 1, target: 1 } },
        { id: 'a2', key: 'regular', name: 'Regular', description: 'Finish 25 rounds.', icon: 'Flame', xpReward: 75, game: null, unlockedBy: 0, unlockedAt: null, progress: { current: 4, target: 25 } },
      ],
    });
    renderRoutes([{ path: '/achievements', element: <AchievementsPage /> }], '/achievements');
    expect(await screen.findByText('1 of 2 unlocked. Rounds count when they last at least 10 seconds.')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Regular progress' })).toHaveAttribute('aria-valuenow', '4');
    expect(screen.getByLabelText('First Steps, unlocked')).toBeInTheDocument();
  });
});

describe('NotificationBell', () => {
  it('shows the unread count', async () => {
    mockApi(fetchMock, testUser(), { 'GET /notifications/unread-count': { unread: 3 } });
    renderRoutes([{ path: '/', element: <NotificationBell /> }], '/');
    expect(await screen.findByRole('link', { name: 'Notifications, 3 unread' })).toHaveAttribute('href', '/notifications');
  });
});
