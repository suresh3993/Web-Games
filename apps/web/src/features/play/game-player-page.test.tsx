import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameHost, GameModule } from '@playverse/game-runtime';
import type { CurrentUser, GameDetail, GameSessionResult } from '@playverse/shared-types';
import { resetCsrfToken } from '@/lib/api';
import { GamePlayerPage } from './game-player-page';
import { toSubmission } from './use-game-runner';

// Replace only the module loader: the real GameController drives the fake game.
const runtime = vi.hoisted(() => ({ host: null as GameHost | null, destroyed: 0 }));
vi.mock('@playverse/game-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@playverse/game-runtime')>();
  const fakeModule: GameModule = {
    manifest: {
      key: 'snake',
      version: '1.0.0',
      engine: 'CANVAS',
      input: { keyboard: true, touch: true, pointer: true },
      supportsPause: true,
      supportsSound: true,
      orientation: 'any',
      aspectRatio: 4 / 3,
      scoring: { kind: 'points', order: 'higher-is-better', label: 'Score', maxScore: 1000 },
      controls: [{ action: 'Steer', keys: 'Arrow keys / swipe' }],
    },
    create(host) {
      runtime.host = host;
      const el = document.createElement('div');
      el.textContent = 'fake game';
      host.container.appendChild(el);
      return {
        start() {},
        pause() {},
        resume() {},
        restart() {},
        finish() {
          host.emit({ type: 'finished', result: { score: 3, outcome: 'quit', stats: {} } });
        },
        resize() {},
        destroy() {
          runtime.destroyed++;
          el.remove();
        },
      };
    },
  };
  return { ...actual, loadGameModule: vi.fn(async () => fakeModule) };
});

const json = (status: number, body: unknown) =>
  status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const baseUser: CurrentUser = {
  id: 'u1',
  email: 'player@example.com',
  emailVerified: true,
  displayName: 'Pixel Pilot',
  avatarUrl: null,
  role: 'USER',
  xp: 40,
  level: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const baseGame: GameDetail = {
  id: 'g1',
  slug: 'snake',
  title: 'Snake',
  shortDescription: 'Eat and grow.',
  thumbnailUrl: null,
  thumbnailSrcSet: null,
  difficulty: 'EASY',
  supportedDevices: ['DESKTOP', 'MOBILE'],
  estimatedMinutes: 5,
  status: 'PUBLISHED',
  playable: true,
  isFeatured: false,
  supportsScores: true,
  primaryCategory: { slug: 'arcade', name: 'Arcade', icon: 'Joystick', accentColor: '#7c5cff' },
  description: 'Eat and grow without biting yourself.',
  instructions: 'Use the arrow keys to steer.',
  engine: 'CANVAS',
  runtimeKey: 'snake',
  supportsProgress: false,
  multiplayerMode: null,
  licenseType: 'ORIGINAL',
  categories: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const result: GameSessionResult = {
  sessionId: 's1',
  preview: false,
  score: 42,
  outcome: 'won',
  durationMs: 61_000,
  flagged: false,
  personalBest: 42,
  isPersonalBest: true,
  rank: 3,
  xpAwarded: 18,
  xpNote: null,
  xp: 58,
  level: 1,
  leveledUp: false,
  achievements: [{ key: 'first-round', name: 'First Steps', icon: 'Gamepad2', xpReward: 25 }],
  challengesCompleted: [],
  bonusXp: 25,
};

const fetchMock = vi.fn<typeof fetch>();
const calls = () => fetchMock.mock.calls.map(([input, init]) => ({ url: String(input), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined }));

function serve({ user = baseUser as CurrentUser | null, game = baseGame, preview = false } = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const route = `${init?.method ?? 'GET'} ${url.pathname}`;
    switch (route) {
      case 'GET /api/v1/auth/session':
        return json(200, { data: user });
      case 'GET /api/v1/auth/csrf':
        return json(200, { data: { csrfToken: 'csrf' } });
      case 'GET /api/v1/games/snake':
        return json(200, { data: game });
      case 'GET /api/v1/games/snake/me':
        return json(200, { data: { bestScore: 30, plays: 2, totalTimeMs: 1000, lastPlayedAt: null, rank: 5, isFavorite: false } });
      case 'GET /api/v1/games/snake/leaderboard':
        return json(200, { data: { period: 'all', entries: [] } });
      case 'GET /api/v1/games/snake/related':
        return json(200, { data: [] });
      case 'POST /api/v1/game-sessions':
        return json(201, { data: { id: 's1', seed: 'abc123', preview, startedAt: new Date().toISOString(), personalBest: preview ? null : 30 } });
      case 'POST /api/v1/game-sessions/s1/finish':
        return json(200, { data: preview ? { ...result, preview: true, xpAwarded: 0, personalBest: null, isPersonalBest: false, rank: null } : result });
      default:
        return json(404, { error: { code: 'NOT_FOUND', message: `unexpected ${route}` } });
    }
  });
}

/** The big Play button on the start overlay (the toolbar has one too). */
const overlayPlay = async () => within(await screen.findByRole('region', { name: 'Start' }, { timeout: 3000 })).getByRole('button', { name: 'Play' });

function renderPlayer(path = '/games/snake/play') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: '/games/:slug/play', element: <GamePlayerPage /> },
      { path: '*', element: <p>Elsewhere</p> },
    ],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  resetCsrfToken();
  fetchMock.mockReset();
  runtime.host = null;
  runtime.destroyed = 0;
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('GamePlayerPage access', () => {
  it('asks guests to log in and returns them to the player afterwards', async () => {
    serve({ user: null });
    renderPlayer();
    expect(await screen.findByRole('heading', { name: 'Log in to play Snake' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login?next=%2Fgames%2Fsnake%2Fplay');
    expect(calls().some((c) => c.url.includes('/game-sessions'))).toBe(false);
  });

  it('asks unverified players to verify their email', async () => {
    serve({ user: { ...baseUser, emailVerified: false } });
    renderPlayer();
    expect(await screen.findByRole('heading', { name: 'Verify your email to play' })).toBeInTheDocument();
  });

  it('does not offer unpublished games to regular players', async () => {
    serve({ game: { ...baseGame, status: 'COMING_SOON', playable: false } });
    renderPlayer();
    expect(await screen.findByRole('heading', { name: 'Snake isn’t available yet' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /play/i })).not.toBeInTheDocument();
  });
});

describe('GamePlayerPage round flow', () => {
  it('starts a server session, shows the live score and submits the result once', async () => {
    serve();
    const user = userEvent.setup();
    renderPlayer();

    const stage = await screen.findByTestId('game-stage');
    const play = await overlayPlay();
    expect(screen.getByText('Arrow keys / swipe')).toBeInTheDocument();
    await user.click(play);

    await waitFor(() => expect(stage).toHaveAttribute('data-phase', 'running'));
    expect(screen.getByText('fake game')).toBeInTheDocument();
    expect(calls().find((c) => c.url.endsWith('/game-sessions'))).toMatchObject({ method: 'POST', body: { slug: 'snake' } });
    expect(runtime.host?.seed).toBe('abc123');

    act(() => runtime.host!.emit({ type: 'score', score: 42 }));
    expect(screen.getByTestId('live-score')).toHaveTextContent('42');

    act(() => runtime.host!.emit({ type: 'finished', result: { score: 42, outcome: 'won', stats: { apples: 4, 'not valid': 1, nope: Number.NaN } } }));
    const summary = await screen.findByTestId('round-result');
    expect(summary).toHaveTextContent('You win!');
    expect(summary).toHaveTextContent('New personal best!');
    expect(summary).toHaveTextContent('Rank #3');
    expect(summary).toHaveTextContent('+18 XP');
    expect(summary).toHaveTextContent('+25 bonus XP');
    expect(summary).toHaveTextContent('Achievement unlocked: First Steps');

    const finishes = calls().filter((c) => c.url.endsWith('/finish'));
    expect(finishes).toHaveLength(1);
    expect(finishes[0]!.body).toMatchObject({ score: 42, outcome: 'won', stats: { apples: 4 } });
    expect(Object.keys(finishes[0]!.body.stats)).toEqual(['apples']);
  });

  it('marks staff previews of unpublished games as unsaved', async () => {
    serve({ user: { ...baseUser, role: 'MODERATOR' }, game: { ...baseGame, status: 'COMING_SOON', playable: false }, preview: true });
    const user = userEvent.setup();
    renderPlayer();
    expect(await screen.findByText('Preview mode: scores are not saved')).toBeInTheDocument();
    await user.click(await overlayPlay());
    await waitFor(() => expect(screen.getByTestId('game-stage')).toHaveAttribute('data-phase', 'running'));
    await user.click(screen.getByRole('button', { name: 'End round' }));
    expect(await screen.findByTestId('round-result')).toHaveTextContent('Preview round: nothing was saved.');
  });

  it('lets staff preview a published game with ?preview=1 (players cannot)', async () => {
    serve({ user: { ...baseUser, role: 'ADMIN' }, preview: true });
    const user = userEvent.setup();
    renderPlayer('/games/snake/play?preview=1');
    expect(await screen.findByText('Preview mode: scores are not saved')).toBeInTheDocument();
    await user.click(await overlayPlay());
    await waitFor(() => expect(screen.getByTestId('game-stage')).toHaveAttribute('data-phase', 'running'));
    expect(calls().find((c) => c.url.endsWith('/game-sessions'))?.body).toEqual({ slug: 'snake', preview: true });
  });

  it('ignores ?preview=1 for regular players', async () => {
    serve();
    const user = userEvent.setup();
    renderPlayer('/games/snake/play?preview=1');
    await user.click(await overlayPlay());
    await waitFor(() => expect(screen.getByTestId('game-stage')).toHaveAttribute('data-phase', 'running'));
    expect(screen.queryByText('Preview mode: scores are not saved')).not.toBeInTheDocument();
    expect(calls().find((c) => c.url.endsWith('/game-sessions'))?.body).toEqual({ slug: 'snake' });
  });

  it('ends and submits an unfinished round when the player leaves the page', async () => {
    serve();
    const user = userEvent.setup();
    const router = renderPlayer();
    await user.click(await overlayPlay());
    await waitFor(() => expect(screen.getByTestId('game-stage')).toHaveAttribute('data-phase', 'running'));

    act(() => void router.navigate('/explore'));
    // In-app navigation mid-round asks for confirmation first.
    expect(await screen.findByRole('heading', { name: 'Leave this game?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Leave game' }));
    expect(await screen.findByText('Elsewhere')).toBeInTheDocument();
    await waitFor(() => expect(calls().filter((c) => c.url.endsWith('/finish'))).toHaveLength(1));
    expect(calls().find((c) => c.url.endsWith('/finish'))!.body).toMatchObject({ outcome: 'quit', score: 3 });
    expect(runtime.destroyed).toBe(1);
  });
});

describe('toSubmission', () => {
  it('clamps values to what the API accepts', () => {
    const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`s${i}`, i]));
    const body = toSubmission({ score: 1e12, outcome: 'lost', durationMs: 1e9, seed: 'x', stats: many });
    expect(body.score).toBe(2_000_000_000);
    expect(body.durationMs).toBe(4 * 60 * 60 * 1000);
    expect(Object.keys(body.stats)).toHaveLength(24);
  });
});
