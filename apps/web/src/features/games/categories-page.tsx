import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { CategoryIcon } from '@/components/game/category-icon';
import { QueryError } from '@/components/query-error';
import { Skeleton } from '@/components/ui/skeleton';
import { useCategories } from './api';

export function CategoriesPage() {
  const { data, isPending, isError, error, refetch } = useCategories();

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold sm:text-4xl">Game categories</h1>
        <p className="mt-1 text-muted-foreground">Fourteen genres — pick one and dive in.</p>
      </header>

      {isError ? (
        <QueryError error={error} onRetry={() => void refetch()} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isPending
            ? Array.from({ length: 9 }, (_, i) => (
                <li key={i}>
                  <Skeleton className="h-36 rounded-xl" />
                </li>
              ))
            : data.map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/explore?category=${c.slug}`}
                    className="glass group relative flex h-full flex-col gap-3 overflow-hidden rounded-xl border border-border p-6 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-glow"
                  >
                    <div
                      className="absolute -top-10 -right-10 size-36 rounded-full opacity-20 blur-2xl transition-opacity group-hover:opacity-40"
                      style={{ backgroundColor: c.accentColor }}
                      aria-hidden="true"
                    />
                    <div className="flex items-center gap-3">
                      <span
                        className="flex size-11 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `${c.accentColor}26`, color: c.accentColor }}
                      >
                        <CategoryIcon name={c.icon} className="size-6" />
                      </span>
                      <div>
                        <h2 className="text-lg font-semibold">{c.name}</h2>
                        <p className="text-xs text-muted-foreground">
                          {c.gameCount} {c.gameCount === 1 ? 'game' : 'games'}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">{c.description}</p>
                    <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary-text">
                      Browse {c.name.toLowerCase()} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
        </ul>
      )}
    </div>
  );
}
