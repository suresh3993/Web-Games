import { zodResolver } from '@hookform/resolvers/zod';
import { Crown, Flag, Heart, Medal } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { REPORT_REASONS, type LeaderboardEntry, type ReportReason } from '@playverse/shared-types';
import { gameReportSchema, type GameReportInput } from '@playverse/validation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { isApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useMyGameStats, useReportGame, useToggleFavorite } from './api';

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

const REASON_LABELS: Record<ReportReason, string> = {
  BROKEN: 'It’s broken or won’t load',
  INAPPROPRIATE: 'Inappropriate content',
  CHEATING: 'Cheating on the leaderboard',
  OTHER: 'Something else',
};

/** "Report a problem" dialog. `onOpenChange` lets the player pause the game meanwhile. */
export function ReportDialog({
  slug,
  container,
  onOpenChange,
}: {
  slug: string;
  container?: HTMLElement | null;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const report = useReportGame(slug);
  const form = useForm<GameReportInput>({ resolver: zodResolver(gameReportSchema), defaultValues: { reason: 'BROKEN', details: '' } });
  const change = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
    if (!next) form.reset();
  };
  const submit = form.handleSubmit((values) =>
    report.mutate(values, {
      onSuccess: (res) => {
        toast.success(res.message);
        change(false);
      },
      onError: (err) => toast.error(isApiError(err) ? err.message : 'Could not send the report.'),
    }),
  );
  const detailsError = form.formState.errors.details?.message;

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Flag aria-hidden="true" /> Report a problem
        </Button>
      </DialogTrigger>
      <DialogContent container={container}>
        <DialogTitle>Report a problem</DialogTitle>
        <DialogDescription>Tell our moderators what went wrong. Reports are private.</DialogDescription>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">What’s the problem?</legend>
            {REPORT_REASONS.map((reason) => (
              <label key={reason} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="radio" value={reason} {...form.register('reason')} className="accent-[var(--primary)]" />
                {REASON_LABELS[reason]}
              </label>
            ))}
          </fieldset>
          <div className="grid gap-1.5">
            <Label htmlFor="report-details">Details</Label>
            <textarea
              id="report-details"
              rows={4}
              maxLength={2000}
              aria-invalid={Boolean(detailsError) || undefined}
              aria-describedby={detailsError ? 'report-details-error' : undefined}
              className="rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              {...form.register('details')}
            />
            {detailsError && (
              <p id="report-details-error" className="text-xs text-destructive">
                {detailsError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => change(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={report.isPending}>
              Send report
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
      {entries.map((entry) => {
        const Icon = RANK_ICONS[entry.rank - 1];
        return (
          <li
            key={`${entry.rank}-${entry.displayName}-${entry.achievedAt}`}
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
