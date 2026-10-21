import { ArrowLeft, Clock, Gauge, Hourglass, Monitor, Smartphone, Tablet, Trophy, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import type { DeviceType, GameDetail } from '@playverse/shared-types';
import { EmptyState } from '@/components/empty-state';
import { CategoryIcon } from '@/components/game/category-icon';
import { GameArt } from '@/components/game/game-art';
import { GameGrid } from '@/components/game/game-card';
import { QueryError } from '@/components/query-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/features/auth/api';
import { isApiError } from '@/lib/api';
import { titleCase } from '@/lib/utils';
import { useGame, useRelatedGames } from './api';

const DEVICE_ICONS: Record<DeviceType, typeof Monitor> = { DESKTOP: Monitor, TABLET: Tablet, MOBILE: Smartphone };

function Fact({ icon: Icon, label, children }: { icon: typeof Monitor; label: string; children: ReactNode }) {
  return (
    <div className="glass rounded-lg border border-border p-4">
      <dt className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" /> {label}
      </dt>
      <dd className="mt-1 font-semibold">{children}</dd>
    </div>
  );
}

/**
 * Availability panel. The in-browser player ships in Milestone 3; until a game is
 * published with a tested runtime, the page states plainly that it is coming soon.
 */
function AvailabilityPanel({ game }: { game: GameDetail }) {
  const { data: user } = useCurrentUser();
  return (
    <div className="glass grid gap-3 rounded-xl border border-border p-5">
      {game.playable ? (
        <Badge variant="success" className="w-fit">
          Available
        </Badge>
      ) : (
        <Badge variant="warning" className="w-fit">
          <Hourglass aria-hidden="true" /> Coming soon
        </Badge>
      )}
      <p className="text-sm text-muted-foreground">
        {game.playable
          ? 'This game is live. Log in to play it in your browser and save your scores.'
          : 'This game is in development. We only publish games after their controls, scoring and launch flow have been tested.'}
      </p>
      {user ? (
        <p className="text-sm font-medium">
          {game.playable
            ? 'You’re signed in. In-browser launching arrives with the game player release.'
            : 'You’re signed in — this game will appear in your library as soon as it launches.'}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to={`/register`}>Create a free account</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={`/login?next=${encodeURIComponent(`/games/${game.slug}`)}`}>Log in</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

function RelatedGames({ slug }: { slug: string }) {
  const { data, isPending, isError } = useRelatedGames(slug);
  if (isError || (!isPending && data.length === 0)) return null;
  return (
    <section aria-label="Related games" className="mt-16">
      <h2 className="mb-6 text-2xl font-bold">More like this</h2>
      <GameGrid games={data?.slice(0, 4)} loading={isPending} skeletonCount={4} />
    </section>
  );
}

export function GameDetailsPage() {
  const { slug = '' } = useParams();
  const { data: game, isPending, isError, error, refetch } = useGame(slug);

  if (isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        {isApiError(error) && (error.status === 404 || error.status === 400) ? (
          <EmptyState
            icon={Trophy}
            title="Game not found"
            description="This game does not exist or is no longer available."
            action={
              <Button asChild>
                <Link to="/explore">Browse games</Link>
              </Button>
            }
          />
        ) : (
          <QueryError error={error} onRetry={() => void refetch()} />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Button asChild variant="link" className="mb-6">
        <Link to="/explore">
          <ArrowLeft aria-hidden="true" /> All games
        </Link>
      </Button>

      {isPending ? (
        <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]" aria-busy="true">
          <Skeleton className="aspect-[16/10] rounded-2xl" />
          <div className="grid content-start gap-4">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      ) : (
        <article>
          <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
            <div className="overflow-hidden rounded-2xl border border-border shadow-glow">
              <GameArt
                slug={game.slug}
                title={game.title}
                accentColor={game.primaryCategory.accentColor}
                icon={game.primaryCategory.icon}
                thumbnailUrl={game.thumbnailUrl}
              />
            </div>
            <div className="grid content-start gap-5">
              <div className="flex flex-wrap gap-2">
                {game.categories.map((c) => (
                  <Link key={c.slug} to={`/explore?category=${c.slug}`}>
                    <Badge variant="accent" className="hover:brightness-125">
                      <CategoryIcon name={c.icon} /> {c.name}
                    </Badge>
                  </Link>
                ))}
              </div>
              <h1 className="text-4xl font-bold sm:text-5xl">{game.title}</h1>
              <p className="text-lg text-muted-foreground">{game.description}</p>
              <AvailabilityPanel game={game} />
            </div>
          </div>

          <dl className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Fact icon={Gauge} label="Difficulty">
              {titleCase(game.difficulty)}
            </Fact>
            <Fact icon={Clock} label="Typical session">
              ~{game.estimatedMinutes} minutes
            </Fact>
            <Fact icon={Monitor} label="Devices">
              <span className="flex gap-2">
                {game.supportedDevices.map((d) => {
                  const Icon = DEVICE_ICONS[d];
                  return (
                    <span key={d} className="inline-flex items-center gap-1 text-sm">
                      <Icon className="size-4" aria-hidden="true" />
                      {titleCase(d)}
                    </span>
                  );
                })}
              </span>
            </Fact>
            <Fact icon={game.multiplayerMode ? Users : Trophy} label={game.multiplayerMode ? 'Players' : 'Scoring'}>
              {game.multiplayerMode
                ? '1–2 (same device)'
                : game.supportsScores
                  ? 'High scores & leaderboard'
                  : 'Just for fun'}
            </Fact>
          </dl>

          <section aria-labelledby="how-to-play" className="glass mt-10 rounded-xl border border-border p-6">
            <h2 id="how-to-play" className="text-xl font-semibold">
              How to play
            </h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">{game.instructions}</p>
          </section>

          <RelatedGames slug={game.slug} />
        </article>
      )}
    </div>
  );
}
