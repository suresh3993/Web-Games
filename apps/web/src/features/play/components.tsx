import { Crown, Heart, Medal } from 'lucide-react';
import { toast } from 'sonner';
import type { LeaderboardEntry } from '@suresh/shared-types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { isApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useMyGameStats, useToggleFavorite } from './api';

export function FavoriteButton({ slug, title }: { slug: string; title: string }) {
  const { data: stats } = useMyGameStats(slug);
  const toggle = useToggleFavorite(slug);
  const favorite = stats?.isFavorite ?? false;
  return (
    <Button
      variant="outline"
      size="sm"
      aria-pressed={favorite}
      disabled={!stats}
      onClick={() =>
        toggle.mutate(!favorite, {
          onSuccess: () => toast.success(favorite ? `Removed ${title} from favourites.` : `Added ${title} to favourites.`),
          onError: (err) => toast.error(isApiError(err) ? err.message : 'Could not update favourites.'),
        })
      }
    >
      <Heart className={cn(favorite && 'fill-current text-rose-500')} aria-hidden="true" />
      {favorite ? 'Favourited' : 'Favourite'}
    </Button>
  );
}

const RANK_ICONS = [Crown, Medal, Medal];
const RANK_COLORS = ['text-amber-400', 'text-slate-300', 'text-orange-400'];

export function LeaderboardList({
  entries,
  loading,
  scoreLabel = 'Score',
  emptyText = 'No scores yet — be the first!',
}: {
  entries: LeaderboardEntry[] | undefined;
  loading?: boolean;
  scoreLabel?: string;
  emptyText?: string;
}) {
  if (loading) {
    return (
      <div className="grid gap-2" aria-busy="true">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </div>
    );
  }
  if (!entries?.length) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <ol className="grid gap-1" aria-label="Leaderboard">
      {entries.map((entry, position) => {
        const Icon = RANK_ICONS[entry.rank - 1];
        return (
          <li
            // Names aren't unique and ties share a rank: key by position in this static, ordered list.
            key={position}
            className={cn('flex items-center gap-3 rounded-md px-2 py-1.5 text-sm', entry.isYou && 'bg-primary/15 font-semibold')}
          >
            <span className="flex w-8 shrink-0 items-center justify-center font-display tabular-nums">
              {Icon ? <Icon className={cn('size-4', RANK_COLORS[entry.rank - 1])} aria-label={`Rank ${entry.rank}`} /> : `#${entry.rank}`}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {entry.displayName}
              {entry.isYou && <span className="ml-1 text-xs text-primary-text">(you)</span>}
            </span>
            <span className="text-xs text-muted-foreground">Lv {entry.level}</span>
            <span className="w-20 text-right font-display tabular-nums" aria-label={`${scoreLabel} ${entry.score}`}>
              {entry.score.toLocaleString()}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
