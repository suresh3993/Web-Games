import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CurrentUser, MessageResponse } from '@playverse/shared-types';
import type { ForgotPasswordInput, LoginInput, RegisterInput, ResetPasswordInput } from '@playverse/validation';
import { api, isApiError, resetCsrfToken } from '@/lib/api';

export const meQueryKey = ['auth', 'me'] as const;

/** Current user, or `null` when logged out (the session probe never answers 401). */
export const currentUserQuery = queryOptions({
  queryKey: meQueryKey,
  queryFn: async () => {
    try {
      return await api<CurrentUser | null>('/auth/session');
    } catch (err) {
      if (isApiError(err) && err.status === 401) return null;
      throw err;
    }
  },
  staleTime: 5 * 60_000,
});

export function useCurrentUser() {
  return useQuery(currentUserQuery);
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => api<CurrentUser>('/auth/login', { method: 'POST', body: input }),
    onSuccess: (user) => queryClient.setQueryData(meQueryKey, user),
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (input: RegisterInput) => api<MessageResponse>('/auth/register', { method: 'POST', body: input }),
  });
}

export function useLogout(everywhere = false) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>(everywhere ? '/auth/logout-all' : '/auth/logout', { method: 'POST' }),
    onSettled: () => {
      resetCsrfToken();
      queryClient.setQueryData(meQueryKey, null);
      // Drop any user-specific cached data.
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] === 'me' });
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (input: ForgotPasswordInput) => api<MessageResponse>('/auth/forgot-password', { method: 'POST', body: input }),
  });
}

export function useResetPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ResetPasswordInput) => api<MessageResponse>('/auth/reset-password', { method: 'POST', body: input }),
    // The server revoked every session.
    onSuccess: () => queryClient.setQueryData(meQueryKey, null),
  });
}

export function useVerifyEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => api<MessageResponse>('/auth/verify-email', { method: 'POST', body: { token } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meQueryKey }),
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: () => api<MessageResponse>('/auth/resend-verification', { method: 'POST' }),
  });
}
