import { CalendarCheck, Check, Lock, Play, RefreshCw, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import type { AchievementSummary, DailyChallengeView, MyAchievement } from '@playverse/shared-types';
import { AchievementIcon, ProgressBar } from '@/components/data-display';
import { PageShell } from '@/components/page-shell';
import { QueryError } from '@/components/query-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/features/auth/api';
import { isApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useDailyChallenges, useMyAchievements, usePublicAchievements, useRefreshChallenge } from './api';

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

function AchievementCard({ achievement, mine }: { achievement: AchievementSummary; mine?: MyAchievement }) {
  const unlocked = Boolean(mine?.unlockedAt);
  return (
    <li
      className={cn('glass flex gap-4 rounded-xl border p-4', unlocked ? 'border-amber-400/40' : 'border-border')}
      aria-label={`${achievement.name}, ${unlocked ? 'unlocked' : 'locked'}`}
    >
      <span
        className={cn(
          'flex size-12 shrink-0 items-center justify-center rounded-full',
          unlocked ? 'bg-amber-400/15 text-amber-400' : 'bg-muted text-muted-foreground',
        )}
      >
        {unlocked || !mine ? <AchievementIcon name={achievement.icon} className="size-6" /> : <Lock className="size-5" aria-hidden="true" />}
      </span>
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">{achievement.name}</h2>
          <Badge variant="primary">+{achievement.xpReward} XP</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{achievement.description}</p>
        {achievement.game && (
          <Link to={`/games/${achievement.game.slug}`} className="w-fit text-xs text-accent-text hover:underline">
            {achievement.game.title}
          </Link>
        )}
        {mine && !unlocked && (
          <div className="mt-1 grid gap-1">
            <ProgressBar value={mine.progress.current} max={mine.progress.target} label={`${achievement.name} progress`} />
            <p className="text-xs text-muted-foreground">
              {mine.progress.current.toLocaleString()} / {mine.progress.target.toLocaleString()}
            </p>
          </div>
        )}
        {unlocked && <p className="text-xs text-amber-400">Unlocked {new Date(mine!.unlockedAt!).toLocaleDateString()}</p>}
        <p className="text-xs text-muted-foreground">
          {achievement.unlockedBy === 1 ? '1 player has this' : `${achievement.unlockedBy.toLocaleString()} players have this`}
        </p>
      </div>
    </li>
  );
}

type Filter = 'all' | 'unlocked' | 'locked';

export function AchievementsPage() {
  const { data: user } = useCurrentUser();
  const publicList = usePublicAchievements();
  const mine = useMyAchievements(Boolean(user));
  const [filter, setFilter] = useState<Filter>('all');
  const query = user ? mine : publicList;
  const items: { achievement: AchievementSummary; mine?: MyAchievement }[] = user
    ? (mine.data ?? []).map((a) => ({ achievement: a, mine: a }))
    : (publicList.data ?? []).map((a) => ({ achievement: a }));
  const unlockedCount = items.filter((i) => i.mine?.unlockedAt).length;
  const visible = items.filter((i) => filter === 'all' || (filter === 'unlocked' ? i.mine?.unlockedAt : !i.mine?.unlockedAt));

  return (
    <PageShell
      icon={Trophy}
      title="Achievements"
      description={user ? `${unlockedCount} of ${items.length} unlocked. Rounds count when they last at least 10 seconds.` : 'Unlock achievements by playing. Log in to track your progress.'}
      actions={
        user ? (
          <div role="group" aria-label="Filter achievements" className="flex gap-1">
            {(['all', 'unlocked', 'locked'] as Filter[]).map((f) => (
              <Button key={f} size="sm" variant={filter === f ? 'primary' : 'ghost'} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f[0]!.toUpperCase() + f.slice(1)}
              </Button>
            ))}
          </div>
        ) : (
          <Button asChild>
            <Link to="/login?next=%2Fachievements">Log in to track progress</Link>
          </Button>
        )
      }
    >
      {query.isError ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <div className="grid gap-3 md:grid-cols-2" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {visible.map((i) => (
            <AchievementCard key={i.achievement.id} achievement={i.achievement} mine={i.mine} />
          ))}
        </ul>
      )}
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Daily challenges
// ---------------------------------------------------------------------------

function useCountdown(until: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  if (!until) return null;
  const ms = Math.max(0, new Date(until).getTime() - now);
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours} h ${minutes} min`;
}

function challengeLink(c: DailyChallengeView) {
  if (c.game) return { to: `/games/${c.game.slug}`, label: `Play ${c.game.title}` };
  if (c.category) return { to: `/explore?category=${c.category.slug}`, label: `Browse ${c.category.name}` };
  return { to: '/explore', label: 'Find a game' };
}

function ChallengeCard({ challenge, signedIn }: { challenge: DailyChallengeView; signedIn: boolean }) {
  const refresh = useRefreshChallenge();
  const done = Boolean(challenge.completedAt);
  const link = challengeLink(challenge);
  return (
    <li className={cn('glass grid gap-3 rounded-xl border p-5', done ? 'border-success/50' : 'border-border')}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{challenge.title}</h2>
        <Badge variant="primary">+{challenge.xpReward} XP</Badge>
        {done && (
          <Badge variant="success">
            <Check aria-hidden="true" /> Completed
          </Badge>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{challenge.description}</p>
      {signedIn && (
        <div className="grid gap-1">
          <ProgressBar value={challenge.progress ?? 0} max={challenge.target} label={`${challenge.title} progress`} />
          <p className="text-xs text-muted-foreground">
            {(challenge.progress ?? 0).toLocaleString()} / {challenge.target.toLocaleString()}
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {!done && (
          <Button asChild size="sm">
            <Link to={link.to}>
              <Play aria-hidden="true" /> {link.label}
            </Link>
          </Button>
        )}
        {signedIn && !done && (
          <Button
            size="sm"
            variant="ghost"
            loading={refresh.isPending}
            onClick={() =>
              refresh.mutate(challenge.id, {
                onSuccess: (c) => (c.completedAt ? toast.success(`Challenge complete! +${c.xpReward} XP`) : toast.info('Progress is up to date.')),
                onError: (err) => toast.error(isApiError(err) ? err.message : 'Could not refresh.'),
              })
            }
          >
            <RefreshCw aria-hidden="true" /> Refresh progress
          </Button>
        )}
      </div>
    </li>
  );
}

export function ChallengesPage() {
  const { data: user } = useCurrentUser();
  const { data, isPending, isError, error, refetch } = useDailyChallenges();
  const countdown = useCountdown(data?.resetsAt);
  return (
    <PageShell
      icon={CalendarCheck}
      title="Daily challenges"
      description={
        <>
          New challenges every day at 00:00 UTC{countdown && <> · resets in {countdown}</>}. Progress updates when you finish a round (rounds of 10 seconds or
          more count).
        </>
      }
      actions={
        !user && (
          <Button asChild>
            <Link to="/login?next=%2Fchallenges">Log in to take part</Link>
          </Button>
        )
      }
    >
      {isError ? (
        <QueryError error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="grid gap-3 md:grid-cols-3" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-3">
          {data.challenges.map((c) => (
            <ChallengeCard key={c.id} challenge={c} signedIn={Boolean(user)} />
          ))}
        </ul>
      )}
    </PageShell>
  );
}
