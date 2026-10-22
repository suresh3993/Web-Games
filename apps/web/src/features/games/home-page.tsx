import { m } from 'framer-motion';
import { ArrowRight, Gamepad2, Layers, ShieldCheck, Smartphone, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { GameGrid } from '@/components/game/game-card';
import { CategoryIcon } from '@/components/game/category-icon';
import { QueryError } from '@/components/query-error';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/features/auth/api';
import { formatNumber } from '@/lib/utils';
import { useCategories, useFeaturedGames, useGames, useTrendingGames } from './api';

function SectionHeading({ title, description, to, linkLabel }: { title: string; description?: string; to?: string; linkLabel?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-2xl font-bold sm:text-3xl">{title}</h2>
        {description && <p className="mt-1 text-muted-foreground">{description}</p>}
      </div>
      {to && (
        <Button asChild variant="link">
          <Link to={to}>
            {linkLabel} <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      )}
    </div>
  );
}

function CatalogStats() {
  const all = useGames({ pageSize: 1 });
  const playable = useGames({ pageSize: 1, status: 'PUBLISHED' });
  const categories = useCategories();
  const stats = [
    { label: 'Games in the catalog', value: all.data?.meta.total },
    { label: 'Categories', value: categories.data?.length },
    { label: 'Playable right now', value: playable.data?.meta.total },
  ];
  return (
    <dl className="mt-10 grid max-w-xl grid-cols-3 gap-4">
      {stats.map((s) => (
        <div key={s.label} className="glass rounded-lg border border-border p-3 sm:p-4">
          <dt className="text-xs text-muted-foreground sm:text-sm">{s.label}</dt>
          <dd className="mt-1 font-display text-2xl font-bold sm:text-3xl">
            {s.value === undefined ? <Skeleton className="h-8 w-12" /> : formatNumber(s.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Hero() {
  const { data: user } = useCurrentUser();
  return (
    <section className="relative overflow-hidden">
      <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl px-4 pt-16 pb-12 sm:px-6 sm:pt-24">
        {/* Slide only: starting at opacity 0 would hide the hero (the LCP element) until the animation runs. */}
        <m.div initial={{ y: 16 }} animate={{ y: 0 }} transition={{ duration: 0.5 }}>
          <p className="glass inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5 text-accent-text" aria-hidden="true" />
            100+ original games on the roadmap — new ones every release
          </p>
          <h1 className="mt-6 max-w-3xl text-4xl leading-[1.05] font-bold sm:text-6xl">
            Your universe of <span className="text-gradient">browser games</span>.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
            Arcade classics, brain teasers, board games and more — built in-house, playable instantly on desktop, tablet and phone.
            No downloads. No installs.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/explore">
                <Gamepad2 aria-hidden="true" /> Explore games
              </Link>
            </Button>
            {!user && (
              <Button asChild size="lg" variant="outline">
                <Link to="/register">Create a free account</Link>
              </Button>
            )}
          </div>
          <CatalogStats />
        </m.div>
      </div>
    </section>
  );
}

function CategoryStrip() {
  const { data, isPending, isError, error, refetch } = useCategories();
  if (isError) return <QueryError error={error} onRetry={() => void refetch()} />;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
      {isPending
        ? Array.from({ length: 14 }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        : data.map((c) => (
            <Link
              key={c.id}
              to={`/explore?category=${c.slug}`}
              className="glass group flex flex-col gap-2 rounded-xl border border-border p-4 transition-all hover:-translate-y-0.5 hover:border-primary/50"
            >
              <span
                className="flex size-9 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${c.accentColor}26`, color: c.accentColor }}
              >
                <CategoryIcon name={c.icon} className="size-5" />
              </span>
              <span className="text-sm leading-tight font-semibold">{c.name}</span>
              <span className="text-xs text-muted-foreground">{c.gameCount} games</span>
            </Link>
          ))}
    </div>
  );
}

const PILLARS = [
  { icon: Smartphone, title: 'Play anywhere', text: 'Responsive games with keyboard, mouse and touch controls.' },
  { icon: ShieldCheck, title: 'Safe by design', text: 'Original content, secure accounts and no real-money gambling.' },
  { icon: Layers, title: 'Always growing', text: 'New games ship in tested batches — only verified games go live.' },
];

export function HomePage() {
  const featured = useFeaturedGames();
  const trending = useTrendingGames();

  return (
    <>
      <Hero />
      <div className="mx-auto grid max-w-7xl gap-20 px-4 sm:px-6">
        <section aria-label="Featured">
          <SectionHeading title="Featured" description="Hand-picked highlights from the PLAYVERSE library." to="/explore" linkLabel="Browse all" />
          {featured.isError ? (
            <QueryError error={featured.error} onRetry={() => void featured.refetch()} />
          ) : (
            <GameGrid games={featured.data?.slice(0, 8)} loading={featured.isPending} />
          )}
        </section>

        <section aria-label="Categories">
          <SectionHeading title="Find your genre" to="/categories" linkLabel="All categories" />
          <CategoryStrip />
        </section>

        <section aria-label="Trending">
          <SectionHeading title="Trending this week" description="Most launched games over the last seven days." to="/explore?sort=popular" linkLabel="See more" />
          {trending.isError ? (
            <QueryError error={trending.error} onRetry={() => void trending.refetch()} />
          ) : (
            <GameGrid games={trending.data?.slice(0, 4)} loading={trending.isPending} skeletonCount={4} />
          )}
        </section>

        <section aria-label="Why PLAYVERSE" className="grid gap-4 md:grid-cols-3">
          {PILLARS.map(({ icon: Icon, title, text }) => (
            <div key={title} className="glass rounded-xl border border-border p-6">
              <Icon className="size-6 text-accent-text" aria-hidden="true" />
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
