import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AchievementSummary,
  CurrentUser,
  DailyChallenges,
  DailyChallengeView,
  MyAchievement,
  NotificationItem,
  PaginationMeta,
  UnreadCount,
  UserProfile,
} from '@suresh/shared-types';
import type { ChangePasswordInput, DeleteAccountInput, UpdateProfileInput } from '@suresh/validation';
import { meQueryKey, useCurrentUser } from '@/features/auth/api';
import { api, apiPaginated, ApiError, apiUrl, resetCsrfToken } from '@/lib/api';

// Keys under 'me' are dropped on logout.
export const accountKeys = {
  profile: ['me', 'profile'] as const,
  achievements: ['me', 'achievements'] as const,
  notifications: (page: number, unread: boolean) => ['me', 'notifications', page, unread] as const,
  unread: ['me', 'notifications', 'unread'] as const,
  challenges: (viewer: string | null) => ['challenges', 'daily', viewer] as const,
  publicAchievements: ['achievements', 'public'] as const,
};

export const useProfile = () =>
  useQuery({ queryKey: accountKeys.profile, queryFn: ({ signal }) => api<UserProfile>('/users/me', { signal }) });

/** Writes a fresh CurrentUser into every place that shows it. */
function useApplyUser() {
  const queryClient = useQueryClient();
  return (user: CurrentUser) => {
    queryClient.setQueryData(meQueryKey, user);
    void queryClient.invalidateQueries({ queryKey: accountKeys.profile });
  };
}

export function useUpdateProfile() {
  const apply = useApplyUser();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => api<CurrentUser>('/users/me', { method: 'PATCH', body: input }),
    onSuccess: apply,
  });
}

export function useUploadAvatar() {
  const apply = useApplyUser();
  return useMutation({
    mutationFn: (file: Blob) => api<CurrentUser>('/users/me/avatar', { method: 'PUT', body: file }),
    onSuccess: apply,
  });
}

export function useRemoveAvatar() {
  const apply = useApplyUser();
  return useMutation({
    mutationFn: () => api<CurrentUser>('/users/me/avatar', { method: 'DELETE' }),
    onSuccess: apply,
  });
}

export const useChangePassword = () =>
  useMutation({ mutationFn: (input: ChangePasswordInput) => api<void>('/users/me/password', { method: 'POST', body: input }) });

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DeleteAccountInput) => api<void>('/users/me', { method: 'DELETE', body: input }),
    onSuccess: () => {
      resetCsrfToken();
      queryClient.setQueryData(meQueryKey, null);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] === 'me' });
    },
  });
}

/** Downloads the personal-data export as a file (the API sends it as an attachment). */
export async function downloadDataExport(): Promise<void> {
  const res = await fetch(apiUrl('/users/me/export'), { credentials: 'include' });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new ApiError(res.status, 'INTERNAL_ERROR', body?.error?.message ?? 'The export could not be created.');
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'suresh-data.json';
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- achievements & challenges ------------------------------------------------------

export const usePublicAchievements = () =>
  useQuery({ queryKey: accountKeys.publicAchievements, queryFn: ({ signal }) => api<AchievementSummary[]>('/achievements', { signal }) });

export const useMyAchievements = (enabled = true) =>
  useQuery({ queryKey: accountKeys.achievements, queryFn: ({ signal }) => api<MyAchievement[]>('/users/me/achievements', { signal }), enabled });

export function useDailyChallenges() {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: accountKeys.challenges(user?.id ?? null),
    queryFn: ({ signal }) => api<DailyChallenges>('/challenges/daily', { signal }),
  });
}

export function useRefreshChallenge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<DailyChallengeView>(`/challenges/${encodeURIComponent(id)}/progress`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['challenges'] });
      void queryClient.invalidateQueries({ queryKey: meQueryKey });
      void queryClient.invalidateQueries({ queryKey: accountKeys.unread });
    },
  });
}

// ---- notifications ---------------------------------------------------------------------

export function useNotifications(page: number, unread = false) {
  return useQuery({
    queryKey: accountKeys.notifications(page, unread),
    queryFn: ({ signal }) =>
      apiPaginated<NotificationItem, PaginationMeta>('/notifications', { query: { page, pageSize: 20, unread: unread || undefined }, signal }),
    placeholderData: keepPreviousData,
  });
}

/** Polled once a minute while signed in. */
export function useUnreadCount(enabled: boolean) {
  return useQuery({
    queryKey: accountKeys.unread,
    queryFn: ({ signal }) => api<UnreadCount>('/notifications/unread-count', { signal }),
    enabled,
    refetchInterval: 60_000,
  });
}

function useInvalidateNotifications() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: ['me', 'notifications'] });
}

export function useMarkRead() {
  const invalidate = useInvalidateNotifications();
  return useMutation({ mutationFn: (id: string) => api<void>(`/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' }), onSuccess: invalidate });
}

export function useMarkAllRead() {
  const invalidate = useInvalidateNotifications();
  return useMutation({ mutationFn: () => api<void>('/notifications/read-all', { method: 'POST' }), onSuccess: invalidate });
}
