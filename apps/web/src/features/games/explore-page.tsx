import { ChevronLeft, ChevronRight, SearchX, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { DEVICE_TYPES, DIFFICULTIES, GAME_SORTS, type GameSort, type PublicGameStatus } from '@playverse/shared-types';
import type { ListGamesQueryInput } from '@playverse/validation';
import { EmptyState } from '@/components/empty-state';
import { GameGrid } from '@/components/game/game-card';
import { QueryError } from '@/components/query-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn, formatNumber, titleCase } from '@/lib/utils';
import { useCategories, useGames } from './api';

const PAGE_SIZE = 24;
const SORT_LABELS: Record<GameSort, string> = {
  popular: 'Most popular',
  newest: 'Newest',
  title: 'Title (A–Z)',
  difficulty: 'Difficulty',
};

const selectClass =
  'h-10 w-full rounded-md border border-input bg-card/60 px-3 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40';

const csv = (value: string | null) => (value ? value.split(',').filter(Boolean) : []);

/** All filter state lives in the URL so results are shareable and survive reloads. */
function useExploreParams() {
  const [params, setParams] = useSearchParams();
  const sortParam = params.get('sort');
  const statusParam = params.get('status');
  const page = Math.max(1, Number(params.get('page')) || 1);
  const query: ListGamesQueryInput = {
    q: params.get('q') ?? undefined,
    category: params.get('category') ?? undefined,
    difficulty: csv(params.get('difficulty')),
    device: csv(params.get('device')),
    status: statusParam === 'PUBLISHED' || statusParam === 'COMING_SOON' ? (statusParam as PublicGameStatus) : undefined,
    sort: GAME_SORTS.includes(sortParam as GameSort) ? (sortParam as GameSort) : 'popular',
    page,
    pageSize: PAGE_SIZE,
  };

  const update = (patch: Record<string, string | string[] | undefined>, resetPage = true) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          const str = Array.isArray(value) ? value.join(',') : value;
          if (str) next.set(key, str);
          else next.delete(key);
        }
        if (resetPage && !('page' in patch)) next.delete('page');
        return next;
      },
      { replace: false },
    );
  };

  const activeFilters =
    Number(Boolean(query.q)) +
    Number(Boolean(query.category)) +
    (query.difficulty as string[]).length +
    (query.device as string[]).length +
    Number(Boolean(query.status));

  return { query, page, update, activeFilters, clear: () => setParams(new URLSearchParams()) };
}

function CheckboxGroup({ legend, options, value, onChange }: { legend: string; options: readonly string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      {options.map((option) => {
        const checked = value.includes(option);
        return (
          <label key={option} className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <input
              type="checkbox"
              className="size-4 accent-[var(--primary)]"
              checked={checked}
              onChange={() => onChange(checked ? value.filter((v) => v !== option) : [...value, option])}
            />
            {titleCase(option)}
          </label>
        );
      })}
    </fieldset>
  );
}

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
    </div>
  );
}

export function ExplorePage() {
  const { query, page, update, activeFilters, clear } = useExploreParams();
  const { data, isPending, isFetching, isError, error, refetch } = useGames(query);
  const categories = useCategories();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState(query.q ?? '');

  // Keep the box in sync with back/forward navigation; debounce typing into the URL.
  useEffect(() => setSearch(query.q ?? ''), [query.q]);
  useEffect(() => {
    if (search.trim() === (query.q ?? '')) return;
    const timer = setTimeout(() => update({ q: search.trim() || undefined }), 300);
    return () => clearTimeout(timer);
    // `update`/`query.q` are intentionally omitted: only typing should schedule a URL update.
  }, [search]);

  const categoryName = categories.data?.find((c) => c.slug === query.category)?.name;

  const filters = (
    <div className="grid gap-6">
      <Field label="Search">
        {(id) => <Input id={id} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Title or keyword" maxLength={80} />}
      </Field>
      <Field label="Category">
        {(id) => (
          <select id={id} className={selectClass} value={query.category ?? ''} onChange={(e) => update({ category: e.target.value || undefined })}>
            <option value="">All categories</option>
            {categories.data?.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name} ({c.gameCount})
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Availability">
        {(id) => (
          <select id={id} className={selectClass} value={query.status ?? ''} onChange={(e) => update({ status: e.target.value || undefined })}>
            <option value="">All games</option>
            <option value="PUBLISHED">Playable now</option>
            <option value="COMING_SOON">Coming soon</option>
          </select>
        )}
      </Field>
      <CheckboxGroup legend="Difficulty" options={DIFFICULTIES} value={query.difficulty as string[]} onChange={(v) => update({ difficulty: v })} />
      <CheckboxGroup legend="Device" options={DEVICE_TYPES} value={query.device as string[]} onChange={(v) => update({ device: v })} />
      {activeFilters > 0 && (
        <Button variant="outline" onClick={clear}>
          <X aria-hidden="true" /> Clear all filters
        </Button>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">{categoryName ?? 'Explore games'}</h1>
          <p className="mt-1 text-muted-foreground" aria-live="polite">
            {data ? `${formatNumber(data.meta.total)} ${data.meta.total === 1 ? 'game' : 'games'}` : 'Loading games…'}
            {query.q ? ` matching “${query.q}”` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="lg:hidden"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            aria-controls="explore-filters"
          >
            <SlidersHorizontal aria-hidden="true" /> Filters{activeFilters ? ` (${activeFilters})` : ''}
          </Button>
          <label className="sr-only" htmlFor="sort">
            Sort games
          </label>
          <select id="sort" className={cn(selectClass, 'w-44')} value={query.sort} onChange={(e) => update({ sort: e.target.value })}>
            {GAME_SORTS.map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside id="explore-filters" aria-label="Filters" className={cn('lg:block', filtersOpen ? 'block' : 'hidden')}>
          <div className="glass rounded-xl border border-border p-5 lg:sticky lg:top-24">{filters}</div>
        </aside>

        <section aria-label="Results" className={cn('transition-opacity', isFetching && !isPending && 'opacity-60')}>
          {isError ? (
            <QueryError error={error} onRetry={() => void refetch()} />
          ) : !isPending && data.data.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="No games match those filters"
              description="Try a different search term or remove a filter."
              action={
                <Button variant="outline" onClick={clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <GameGrid games={data?.data} loading={isPending} skeletonCount={9} />
          )}

          {data && data.meta.totalPages > 1 && (
            <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-3">
              <Button variant="outline" disabled={page <= 1} onClick={() => update({ page: String(page - 1) }, false)}>
                <ChevronLeft aria-hidden="true" /> Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {data.meta.totalPages}
              </span>
              <Button variant="outline" disabled={page >= data.meta.totalPages} onClick={() => update({ page: String(page + 1) }, false)}>
                Next <ChevronRight aria-hidden="true" />
              </Button>
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}
