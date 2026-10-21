import { Clock, Crown, Gamepad2, Heart, History, LogIn, Medal, Trophy } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { EmptyState } from '@/components/empty-state';
import { GameArt } from '@/components/game/game-art';
import { GameGrid } from '@/components/game/game-card';
import { QueryError } from '@/components/query-error';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/features/auth/api';
import { useFavorites, useGlobalLeaderboard, usePlayHistory } from '@/features/play/api';
import { cn, formatPlayTime, formatRelative } from '@/lib/utils';

function PageShell({ icon: Icon, title, description, children }: { icon: typeof Heart; title: string; description: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <h1 className="flex items-center gap-3 text-3xl font-bold sm:text-4xl">
          <Icon className="size-8 text-primary-text" aria-hidden="true" /> {title}
        </h1>
        <p className="mt-2 text-muted-foreground">{description}</p>
      </header>
      {children}
    </div>
  );
}

/** Personal pages need an account; the API enforces this, the page explains it. */
function RequireAccount({ children }: { children: ReactNode }) {
  const { data: user, isPending } = useCurrentUser();
  const location = useLocation();
  if (isPending) return <Skeleton className="h-48 w-full rounded-xl" />;
  if (!user) {
    return (
      <EmptyState
        icon={LogIn}
        title="Log in to see this page"
        description="Your favourites, history and stats are tied to your account."
        action={
          <Button asChild>
            <Link to={`/login?next=${encodeURIComponent(location.pathname)}`}>Log in</Link>
          </Button>
        }
      />
    );
  }
  return children;
}

const browseAction = (
  <Button asChild>
    <Link to="/explore">Browse games</Link>
  </Button>
);

function FavoritesList() {
  const { data, isPending, isError, error, refetch } = useFavorites();
  if (isError) return <QueryError error={error} onRetry={() => void refetch()} />;
  if (!isPending && data.length === 0) {
    return <EmptyState icon={Heart} title="No favourites yet" description="Tap the heart on any game to keep it here." action={browseAction} />;
  }
  return <GameGrid games={data} loading={isPending} />;
}

export function FavoritesPage() {
  return (
    <PageShell icon={Heart} title="Favourites" description="Games you’ve saved for later.">
      <RequireAccount>
        <FavoritesList />
      </RequireAccount>
    </PageShell>
  );
}

function HistoryList() {
  const { data, isPending, isError, error, refetch } = usePlayHistory();
  if (isError) return <QueryError error={error} onRetry={() => void refetch()} />;
  if (isPending) {
    return (
      <div className="grid gap-3" aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }
  if (data.length === 0) {
    return <EmptyState icon={History} title="Nothing played yet" description="Games you play show up here with your personal bests." action={browseAction} />;
  }
  return (
    <ul className="grid gap-3">
      {data.map((entry) => (
        <li key={entry.game.id} className="glass flex flex-wrap items-center gap-4 rounded-xl border border-border p-3 sm:flex-nowrap">
          <Link to={`/games/${entry.game.slug}`} className="w-28 shrink-0 overflow-hidden rounded-lg" tabIndex={-1} aria-hidden="true">
            <GameArt
              slug={entry.game.slug}
              title={entry.game.title}
              accentColor={entry.game.primaryCategory.accentColor}
              icon={entry.game.primaryCategory.icon}
              thumbnailUrl={entry.game.thumbnailUrl}
            />
          </Link>
          <div className="min-w-0 flex-1">
            <Link to={`/games/${entry.game.slug}`} className="font-semibold hover:underline">
              {entry.game.title}
            </Link>
            <p className="flex flex-wrap gap-x-4 text-sm text-muted-foreground">
              <span>{entry.plays === 1 ? '1 play' : `${entry.plays} plays`}</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden="true" /> {formatPlayTime(entry.totalTimeMs)}
              </span>
              <span>Last played {formatRelative(entry.lastPlayedAt)}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Best</p>
            <p className="font-display text-xl font-bold tabular-nums">{entry.bestScore === null ? '—' : entry.bestScore.toLocaleString()}</p>
          </div>
          {entry.game.playable && (
            <Button asChild size="sm">
              <Link to={`/games/${entry.game.slug}/play`} aria-label={`Play ${entry.game.title} again`}>
                Play
              </Link>
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function RecentlyPlayedPage() {
  return (
    <PageShell icon={History} title="Recently played" description="Your games, newest first, with personal bests.">
      <RequireAccount>
        <HistoryList />
      </RequireAccount>
    </PageShell>
  );
}

const PODIUM = [
  { icon: Crown, className: 'text-amber-400' },
  { icon: Medal, className: 'text-slate-300' },
  { icon: Medal, className: 'text-orange-400' },
];

function GlobalBoard() {
  const { data, isPending, isError, error, refetch } = useGlobalLeaderboard();
  if (isError) return <QueryError error={error} onRetry={() => void refetch()} />;
  if (isPending) return <Skeleton className="h-96 rounded-xl" />;
  if (data.length === 0) {
    return <EmptyState icon={Trophy} title="No rankings yet" description="Finish a round of any game to earn XP and claim the top spot." action={browseAction} />;
  }
  return (
    <ol className="glass divide-y divide-border overflow-hidden rounded-xl border border-border" aria-label="Players by XP">
      {data.map((entry) => {
        const podium = PODIUM[entry.rank - 1];
        return (
          <li key={`${entry.rank}-${entry.displayName}`} className={cn('flex items-center gap-4 px-4 py-3', entry.isYou && 'bg-primary/15')}>
            <span className="flex w-10 justify-center font-display text-lg font-bold tabular-nums">
              {podium ? <podium.icon className={cn('size-5', podium.className)} aria-label={`Rank ${entry.rank}`} /> : `#${entry.rank}`}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">
              {entry.displayName}
              {entry.isYou && <span className="ml-2 text-xs text-primary-text">(you)</span>}
            </span>
            <span className="text-sm text-muted-foreground">Level {entry.level}</span>
            <span className="w-24 text-right font-display font-bold tabular-nums">{entry.xp.toLocaleString()} XP</span>
          </li>
        );
      })}
    </ol>
  );
}

export function LeaderboardsPage() {
  return (
    <PageShell icon={Trophy} title="Leaderboards" description="Top players by total XP. Each game also has its own leaderboard on its page.">
      <GlobalBoard />
      <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Gamepad2 className="size-4" aria-hidden="true" /> XP: 10 per finished round plus 4 per active minute (max 30), up to 300 per game per day.
      </p>
    </PageShell>
  );
}
