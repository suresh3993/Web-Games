import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  FavoriteGame,
  GameSessionResult,
  GameSessionStart,
  GlobalLeaderboardEntry,
  Leaderboard,
  LeaderboardPeriod,
  MessageResponse,
  MyGameStats,
  PlayHistoryEntry,
} from '@playverse/shared-types';
import type { FinishGameSessionInput, GameReportInput } from '@playverse/validation';
import { useCurrentUser, meQueryKey } from '@/features/auth/api';
import { api } from '@/lib/api';

// Keys under 'me' are dropped on logout (see useLogout).
export const playKeys = {
  myStats: (slug: string) => ['me', 'game-stats', slug] as const,
  favorites: ['me', 'favorites'] as const,
  history: ['me', 'history'] as const,
  leaderboard: (slug: string, period: LeaderboardPeriod, viewer: string | null) => ['leaderboards', 'game', slug, period, viewer] as const,
  global: (viewer: string | null) => ['leaderboards', 'global', viewer] as const,
};

const path = (slug: string) => `/games/${encodeURIComponent(slug)}`;

// ---- gameplay (used imperatively by the player) ------------------------------------

export const startGameSession = (slug: string) =>
  api<GameSessionStart>('/game-sessions', { method: 'POST', body: { slug } });

/** keepalive: the submission still completes if the player closes the tab mid-round. */
export const finishGameSession = (id: string, body: FinishGameSessionInput) =>
  api<GameSessionResult>(`/game-sessions/${encodeURIComponent(id)}/finish`, { method: 'POST', body, keepalive: true });

export const sendHeartbeat = (id: string) => api<void>(`/game-sessions/${encodeURIComponent(id)}`, { method: 'PATCH' });

/** Refreshes everything a finished round can change. */
export function useInvalidateAfterRound() {
  const queryClient = useQueryClient();
  return (slug: string) => {
    void queryClient.invalidateQueries({ queryKey: playKeys.myStats(slug) });
    void queryClient.invalidateQueries({ queryKey: playKeys.history });
    void queryClient.invalidateQueries({ queryKey: ['leaderboards'] });
    void queryClient.invalidateQueries({ queryKey: meQueryKey }); // XP and level
  };
}

// ---- queries -------------------------------------------------------------------------

export function useMyGameStats(slug: string, enabled = true) {
  return useQuery({
    queryKey: playKeys.myStats(slug),
    queryFn: ({ signal }) => api<MyGameStats>(`${path(slug)}/me`, { signal }),
    enabled,
  });
}

export function useLeaderboard(slug: string, period: LeaderboardPeriod = 'all', limit = 10, enabled = true) {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: [...playKeys.leaderboard(slug, period, user?.id ?? null), limit],
    queryFn: ({ signal }) => api<Leaderboard>(`${path(slug)}/leaderboard`, { query: { period, limit }, signal }),
    enabled,
  });
}

export function useGlobalLeaderboard() {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: playKeys.global(user?.id ?? null),
    queryFn: ({ signal }) => api<GlobalLeaderboardEntry[]>('/leaderboards/global', { signal }),
  });
}

export const useFavorites = () =>
  useQuery({ queryKey: playKeys.favorites, queryFn: ({ signal }) => api<FavoriteGame[]>('/users/me/favorites', { signal }) });

export const usePlayHistory = () =>
  useQuery({ queryKey: playKeys.history, queryFn: ({ signal }) => api<PlayHistoryEntry[]>('/users/me/history', { signal }) });

// ---- mutations -----------------------------------------------------------------------

/** Optimistic favourite toggle; rolls back if the API refuses. */
export function useToggleFavorite(slug: string) {
  const queryClient = useQueryClient();
  const key = playKeys.myStats(slug);
  return useMutation({
    mutationFn: (favorite: boolean) => api<void>(`${path(slug)}/favorite`, { method: favorite ? 'POST' : 'DELETE' }),
    onMutate: async (favorite) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<MyGameStats>(key);
      if (previous) queryClient.setQueryData<MyGameStats>(key, { ...previous, isFavorite: favorite });
      return { previous };
    },
    onError: (_err, _favorite, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: playKeys.favorites });
    },
  });
}

export function useReportGame(slug: string) {
  return useMutation({
    mutationFn: (input: GameReportInput) => api<MessageResponse>(`${path(slug)}/reports`, { method: 'POST', body: input }),
  });
}
