import { Clock, Play, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import type { GameSummary } from '@suresh/shared-types';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, titleCase } from '@/lib/utils';
import { GameArt } from './game-art';

export function GameCard({ game, className }: { game: GameSummary; className?: string }) {
  return (
    <Link
      to={`/games/${game.slug}`}
      className={cn(
        'group glass relative flex flex-col overflow-hidden rounded-xl border border-border transition-all duration-300',
        'hover:-translate-y-1 hover:border-primary/50 hover:shadow-glow focus-visible:-translate-y-1',
        'motion-reduce:hover:translate-y-0',
        className,
      )}
    >
      <div className="relative overflow-hidden">
        <GameArt
          slug={game.slug}
          title={game.title}
          accentColor={game.primaryCategory.accentColor}
          icon={game.primaryCategory.icon}
          thumbnailUrl={game.thumbnailUrl}
          thumbnailSrcSet={game.thumbnailSrcSet}
          className="transition-transform duration-500 group-hover:scale-105 motion-reduce:group-hover:scale-100"
        />
        <div className="absolute top-2 left-2">
          {game.playable ? (
            <Badge variant="success" className="glass">
              <Play aria-hidden="true" /> Play now
            </Badge>
          ) : (
            <Badge variant="outline" className="glass text-foreground">
              <Sparkles aria-hidden="true" /> Coming soon
            </Badge>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-xs font-medium tracking-wide text-accent-text uppercase">{game.primaryCategory.name}</p>
        <h3 className="text-base leading-snug font-semibold">{game.title}</h3>
        <p className="line-clamp-2 text-sm text-muted-foreground">{game.shortDescription}</p>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          <Badge variant="primary">{titleCase(game.difficulty)}</Badge>
          <Badge variant="outline">
            <Clock aria-hidden="true" /> ~{game.estimatedMinutes} min
          </Badge>
        </div>
      </div>
    </Link>
  );
}

export function GameCardSkeleton() {
  return (
    <div className="glass flex flex-col overflow-hidden rounded-xl border border-border" aria-hidden="true">
      <Skeleton className="aspect-[16/10] rounded-none" />
      <div className="grid gap-2 p-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

export function GameGrid({ games, loading, skeletonCount = 8 }: { games?: GameSummary[]; loading?: boolean; skeletonCount?: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy={loading || undefined}>
      {loading
        ? Array.from({ length: skeletonCount }, (_, i) => <GameCardSkeleton key={i} />)
        : games?.map((game) => <GameCard key={game.id} game={game} />)}
    </div>
  );
}
