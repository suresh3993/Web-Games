import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query';
import { GAME_SORTS, type CategorySummary, type GameDetail, type GameSort, type GameSummary, type PaginationMeta, type PublicGameStatus } from '@playverse/shared-types';
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

const EXPLORE_PAGE_SIZE = 24;
const csv = (value: string | null) => (value ? value.split(',').filter(Boolean) : []);

/**
 * The catalog query for an Explore URL. All filter state lives in the URL, so results are
 * shareable and survive reloads; the router uses this too, to start the request early.
 */
export function exploreQuery(params: URLSearchParams): ListGamesQueryInput {
  const sort = params.get('sort');
  const status = params.get('status');
  return {
    q: params.get('q') ?? undefined,
    category: params.get('category') ?? undefined,
    difficulty: csv(params.get('difficulty')),
    device: csv(params.get('device')),
    status: status === 'PUBLISHED' || status === 'COMING_SOON' ? (status as PublicGameStatus) : undefined,
    sort: GAME_SORTS.includes(sort as GameSort) ? (sort as GameSort) : 'popular',
    page: Math.max(1, Number(params.get('page')) || 1),
    pageSize: EXPLORE_PAGE_SIZE,
  };
}

export const gamesQuery = (query: ListGamesQueryInput) =>
  queryOptions({
    queryKey: gameKeys.list(query),
    queryFn: ({ signal }) =>
      apiPaginated<GameSummary, PaginationMeta>('/games', {
        query: query as Record<string, string | number | readonly string[] | undefined>,
        signal,
      }),
    placeholderData: keepPreviousData,
  });

export const useGames = (query: ListGamesQueryInput) => useQuery(gamesQuery(query));

export const useFeaturedGames = () =>
  useQuery({ queryKey: gameKeys.featured, queryFn: ({ signal }) => api<GameSummary[]>('/games/featured', { signal }) });

export const useTrendingGames = () =>
  useQuery({ queryKey: gameKeys.trending, queryFn: ({ signal }) => api<GameSummary[]>('/games/trending', { signal }) });

export const categoriesQuery = queryOptions({
  queryKey: gameKeys.categories,
  queryFn: ({ signal }) => api<CategorySummary[]>('/games/categories', { signal }),
  staleTime: 5 * 60_000,
});

export const useCategories = () => useQuery(categoriesQuery);

export const gameQuery = (slug: string) =>
  queryOptions({ queryKey: gameKeys.detail(slug), queryFn: ({ signal }) => api<GameDetail>(`/games/${encodeURIComponent(slug)}`, { signal }) });

export const useGame = (slug: string) => useQuery(gameQuery(slug));

export const useRelatedGames = (slug: string) =>
  useQuery({
    queryKey: gameKeys.related(slug),
    queryFn: ({ signal }) => api<GameSummary[]>(`/games/${encodeURIComponent(slug)}/related`, { signal }),
  });
