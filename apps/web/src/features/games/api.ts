import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { CategorySummary, GameDetail, GameSummary, PaginationMeta } from '@playverse/shared-types';
import type { ListGamesQueryInput } from '@playverse/validation';
import { api, apiPaginated } from '@/lib/api';

export const gameKeys = {
  all: ['games'] as const,
  list: (query: ListGamesQueryInput) => ['games', 'list', query] as const,
  featured: ['games', 'featured'] as const,
  trending: ['games', 'trending'] as const,
  categories: ['games', 'categories'] as const,
  detail: (slug: string) => ['games', 'detail', slug] as const,
  related: (slug: string) => ['games', 'related', slug] as const,
};

export function useGames(query: ListGamesQueryInput) {
  return useQuery({
    queryKey: gameKeys.list(query),
    queryFn: ({ signal }) =>
      apiPaginated<GameSummary, PaginationMeta>('/games', {
        query: query as Record<string, string | number | readonly string[] | undefined>,
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}

export const useFeaturedGames = () =>
  useQuery({ queryKey: gameKeys.featured, queryFn: ({ signal }) => api<GameSummary[]>('/games/featured', { signal }) });

export const useTrendingGames = () =>
  useQuery({ queryKey: gameKeys.trending, queryFn: ({ signal }) => api<GameSummary[]>('/games/trending', { signal }) });

export const useCategories = () =>
  useQuery({
    queryKey: gameKeys.categories,
    queryFn: ({ signal }) => api<CategorySummary[]>('/games/categories', { signal }),
    staleTime: 5 * 60_000,
  });

export const useGame = (slug: string) =>
  useQuery({ queryKey: gameKeys.detail(slug), queryFn: ({ signal }) => api<GameDetail>(`/games/${encodeURIComponent(slug)}`, { signal }) });

export const useRelatedGames = (slug: string) =>
  useQuery({
    queryKey: gameKeys.related(slug),
    queryFn: ({ signal }) => api<GameSummary[]>(`/games/${encodeURIComponent(slug)}/related`, { signal }),
  });
