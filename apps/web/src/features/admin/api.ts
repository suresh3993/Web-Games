import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminAchievement,
  AdminCategory,
  AdminChallenge,
  AdminDashboard,
  AdminGameDetail,
  AdminGameRow,
  AdminReport,
  AdminUserDetail,
  AdminUserRow,
  AuditLogEntry,
  PaginationMeta,
  Role,
} from '@suresh/shared-types';
import type {
  AchievementInput,
  AchievementUpdate,
  AdminGameCreate,
  AdminGameUpdate,
  CategoryInput,
  CategoryUpdate,
  ChallengeInput,
  ChallengeUpdate,
  ReportUpdateInput,
  UserStatusInput,
} from '@suresh/validation';
import { api, apiPaginated } from '@/lib/api';

type Query = Record<string, string | number | undefined>;

export const adminKeys = {
  all: ['admin'] as const,
  dashboard: ['admin', 'dashboard'] as const,
  users: (q: Query) => ['admin', 'users', q] as const,
  user: (id: string) => ['admin', 'user', id] as const,
  games: (q: Query) => ['admin', 'games', q] as const,
  game: (id: string) => ['admin', 'game', id] as const,
  categories: ['admin', 'categories'] as const,
  reports: (q: Query) => ['admin', 'reports', q] as const,
  achievements: ['admin', 'achievements'] as const,
  challenges: (q: Query) => ['admin', 'challenges', q] as const,
  audit: (q: Query) => ['admin', 'audit', q] as const,
};

/** After any admin change, everything admin-related (and public catalog lists) may be stale. */
function useInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: adminKeys.all });
    void queryClient.invalidateQueries({ queryKey: ['games'] });
  };
}

const paged = <T,>(path: string, q: Query, signal?: AbortSignal) => apiPaginated<T, PaginationMeta>(path, { query: q, signal });

export const useAdminDashboard = () =>
  useQuery({ queryKey: adminKeys.dashboard, queryFn: ({ signal }) => api<AdminDashboard>('/admin/dashboard', { signal }), refetchInterval: 60_000 });

export const useAdminUsers = (q: Query) =>
  useQuery({ queryKey: adminKeys.users(q), queryFn: ({ signal }) => paged<AdminUserRow>('/admin/users', q, signal), placeholderData: keepPreviousData });

export const useAdminUser = (id: string | null) =>
  useQuery({ queryKey: adminKeys.user(id ?? ''), queryFn: ({ signal }) => api<AdminUserDetail>(`/admin/users/${id}`, { signal }), enabled: Boolean(id) });

export function useSetUserStatus() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...input }: UserStatusInput & { id: string }) => api<AdminUserRow>(`/admin/users/${id}/status`, { method: 'PATCH', body: input }),
    onSuccess: invalidate,
  });
}

export function useSetUserRole() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => api<AdminUserRow>(`/admin/users/${id}/role`, { method: 'PATCH', body: { role } }),
    onSuccess: invalidate,
  });
}

export const useAdminGames = (q: Query) =>
  useQuery({ queryKey: adminKeys.games(q), queryFn: ({ signal }) => paged<AdminGameRow>('/admin/games', q, signal), placeholderData: keepPreviousData });

export const useAdminGame = (id: string | undefined) =>
  useQuery({ queryKey: adminKeys.game(id ?? ''), queryFn: ({ signal }) => api<AdminGameDetail>(`/admin/games/${id}`, { signal }), enabled: Boolean(id) });

export function useCreateGame() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: AdminGameCreate) => api<AdminGameDetail>('/admin/games', { method: 'POST', body: input }), onSuccess: invalidate });
}

export function useUpdateGame(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: AdminGameUpdate) => api<AdminGameDetail>(`/admin/games/${id}`, { method: 'PATCH', body: input }), onSuccess: invalidate });
}

export function useDeleteGame() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => api<void>(`/admin/games/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}

export function useGameThumbnail(id: string) {
  const invalidate = useInvalidate();
  return {
    upload: useMutation({ mutationFn: (file: Blob) => api<AdminGameDetail>(`/admin/games/${id}/thumbnail`, { method: 'PUT', body: file }), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: () => api<AdminGameDetail>(`/admin/games/${id}/thumbnail`, { method: 'DELETE' }), onSuccess: invalidate }),
  };
}

export const useAdminCategories = () =>
  useQuery({ queryKey: adminKeys.categories, queryFn: ({ signal }) => api<AdminCategory[]>('/admin/categories', { signal }) });

export function useSaveCategory() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CategoryInput | CategoryUpdate }) =>
      id ? api<AdminCategory>(`/admin/categories/${id}`, { method: 'PATCH', body: input }) : api<AdminCategory>('/admin/categories', { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useDeleteCategory() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => api<void>(`/admin/categories/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}

export const useAdminReports = (q: Query) =>
  useQuery({ queryKey: adminKeys.reports(q), queryFn: ({ signal }) => paged<AdminReport>('/admin/reports', q, signal), placeholderData: keepPreviousData });

export function useUpdateReport() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...input }: ReportUpdateInput & { id: string }) => api<AdminReport>(`/admin/reports/${id}`, { method: 'PATCH', body: input }),
    onSuccess: invalidate,
  });
}

export const useAdminAchievements = () =>
  useQuery({ queryKey: adminKeys.achievements, queryFn: ({ signal }) => api<AdminAchievement[]>('/admin/achievements', { signal }) });

export function useSaveAchievement() {
  const invalidate = useInvalidate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: AchievementInput | AchievementUpdate }) =>
      id
        ? api<AdminAchievement>(`/admin/achievements/${id}`, { method: 'PATCH', body: input })
        : api<AdminAchievement>('/admin/achievements', { method: 'POST', body: input }),
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['achievements'] });
    },
  });
}

export function useDeleteAchievement() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => api<void>(`/admin/achievements/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}

export const useAdminChallenges = (q: Query) =>
  useQuery({ queryKey: adminKeys.challenges(q), queryFn: ({ signal }) => api<AdminChallenge[]>('/admin/challenges', { query: q, signal }) });

export function useSaveChallenge() {
  const invalidate = useInvalidate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: ChallengeInput | ChallengeUpdate }) =>
      id ? api<AdminChallenge>(`/admin/challenges/${id}`, { method: 'PATCH', body: input }) : api<AdminChallenge>('/admin/challenges', { method: 'POST', body: input }),
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['challenges'] });
    },
  });
}

export function useDeleteChallenge() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => api<void>(`/admin/challenges/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}

export const useAuditLogs = (q: Query) =>
  useQuery({ queryKey: adminKeys.audit(q), queryFn: ({ signal }) => paged<AuditLogEntry>('/admin/audit-logs', q, signal), placeholderData: keepPreviousData });
