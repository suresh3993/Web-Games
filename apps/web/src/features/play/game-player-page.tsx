import {
  AlertTriangle,
  ArrowLeft,
  Eye,
  Flag,
  Gamepad2,
  Hourglass,
  Keyboard,
  Loader2,
  LogIn,
  MailCheck,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  Smartphone,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Link, useBlocker, useParams } from 'react-router';
import { toast } from 'sonner';
import type { CurrentUser, GameDetail, GameOutcome } from '@playverse/shared-types';
import { EmptyState } from '@/components/empty-state';
import { QueryError } from '@/components/query-error';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser, useResendVerification } from '@/features/auth/api';
import { useGame } from '@/features/games/api';
import { RelatedGames } from '@/features/games/game-details-page';
import { isApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useLeaderboard, useMyGameStats } from './api';
import { FavoriteButton, LeaderboardList, ReportDialog } from './components';
import { useGameRunner, type GameRunner, type RoundSummary } from './use-game-runner';

const OUTCOME_TITLES: Record<GameOutcome, string> = {
  won: 'You win!',
  lost: 'Game over',
  completed: 'Round complete',
  quit: 'Round ended',
};

// ---------------------------------------------------------------------------
// Access gate (the API enforces the same rules; this only explains them)
// ---------------------------------------------------------------------------

function Gate({ icon, title, description, children }: { icon: typeof Play; title: string; description: string; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <EmptyState icon={icon} title={title} description={description} action={<div className="flex flex-wrap justify-center gap-2">{children}</div>} />
    </div>
  );
}

function VerifyGate({ game }: { game: GameDetail }) {
  const resend = useResendVerification();
  return (
    <Gate icon={MailCheck} title="Verify your email to play" description={`Confirm your email address to play ${game.title} and save your scores. Check your inbox for the link.`}>
      <Button
        loading={resend.isPending}
        onClick={() =>
          resend.mutate(undefined, {
            onSuccess: (res) => toast.success(res.message),
            onError: (err) => toast.error(isApiError(err) ? err.message : 'Could not send the email.'),
          })
        }
      >
        Resend verification email
      </Button>
      <Button asChild variant="outline">
        <Link to={`/games/${game.slug}`}>Back to {game.title}</Link>
      </Button>
    </Gate>
  );
}

export function GamePlayerPage() {
  const { slug = '' } = useParams();
  const { data: user, isPending: userPending } = useCurrentUser();
  const { data: game, isPending, isError, error, refetch } = useGame(slug);

  if (isError) {
    return isApiError(error) && (error.status === 404 || error.status === 400) ? (
      <Gate icon={Gamepad2} title="Game not found" description="This game does not exist or is no longer available.">
        <Button asChild>
          <Link to="/explore">Browse games</Link>
        </Button>
      </Gate>
    ) : (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <QueryError error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  if (isPending || userPending) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6" aria-busy="true">
        <Skeleton className="mb-6 h-8 w-64" />
        <Skeleton className="aspect-video w-full rounded-xl" />
      </div>
    );
  }

  if (!user) {
    const next = encodeURIComponent(`/games/${game.slug}/play`);
    return (
      <Gate icon={LogIn} title={`Log in to play ${game.title}`} description="Create a free account or log in to launch games and save your scores, XP and favourites.">
        <Button asChild>
          <Link to={`/login?next=${next}`}>Log in</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/register">Create a free account</Link>
        </Button>
      </Gate>
    );
  }

  if (!user.emailVerified) return <VerifyGate game={game} />;

  const staff = user.role !== 'USER';
  if (!game.runtimeKey || (!game.playable && !staff)) {
    return (
      <Gate icon={Hourglass} title={`${game.title} isn’t available yet`} description="We only publish games after their controls, scoring and launch flow have been tested.">
        <Button asChild variant="outline">
          <Link to={`/games/${game.slug}`}>Back to {game.title}</Link>
        </Button>
      </Gate>
    );
  }

  // Keyed by slug: navigating to another game mounts a fresh player.
  return <Player key={game.slug} game={game} runtimeKey={game.runtimeKey} user={user} preview={!game.playable} />;
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

function useFullscreen(target: RefObject<HTMLElement | null>) {
  const [active, setActive] = useState(false);
  const supported = typeof document !== 'undefined' && Boolean(document.fullscreenEnabled);
  useEffect(() => {
    const onChange = () => setActive(document.fullscreenElement !== null && document.fullscreenElement === target.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [target]);
  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await target.current?.requestFullscreen();
    } catch {
      toast.error('Full screen is not available here.');
    }
  }, [target]);
  return { supported, active, toggle };
}

/** True on small portrait screens when the game prefers landscape. */
function usePortraitWarning(enabled: boolean) {
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    if (!enabled || !window.matchMedia) return;
    const media = window.matchMedia('(orientation: portrait) and (max-width: 900px)');
    const update = () => setPortrait(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [enabled]);
  return portrait;
}

/** Keeps Space/Enter on page controls from also reaching the game's global key handlers. */
const shieldKeys = (event: KeyboardEvent) => {
  if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
};

function Player({ game, runtimeKey, user, preview }: { game: GameDetail; runtimeKey: string; user: CurrentUser; preview: boolean }) {
  const runner = useGameRunner(game.slug, runtimeKey);
  const stageRef = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(stageRef);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);
  const portrait = usePortraitWarning(runner.manifest?.orientation === 'landscape');
  const { data: stats } = useMyGameStats(game.slug, !preview);
  const { manifest, phase, inProgress, pause } = runner;
  const dialogContainer = fullscreen.active ? stageRef.current : null;

  // Leaving mid-round (in-app navigation) asks first; the round is saved as "quit".
  const blocker = useBlocker(({ currentLocation, nextLocation }) => inProgress && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state === 'blocked') pause();
  }, [blocker.state, pause]);

  const ratio = manifest?.aspectRatio && manifest.aspectRatio > 0 ? manifest.aspectRatio : 16 / 9;
  const best = preview ? null : (runner.summary?.result?.personalBest ?? stats?.bestScore ?? runner.session?.personalBest ?? null);
  const scoreLabel = manifest?.scoring?.label ?? 'Score';

  const requestRestart = () => (inProgress ? setConfirmRestart(true) : void runner.startRound());
  const pauseForDialog = (open: boolean) => {
    if (open) runner.pause();
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button asChild variant="link">
          <Link to={`/games/${game.slug}`}>
            <ArrowLeft aria-hidden="true" /> {game.title}
          </Link>
        </Button>
        <h1 className="sr-only">Playing {game.title}</h1>
        {preview && (
          <Badge variant="warning">
            <Eye aria-hidden="true" /> Preview mode: scores are not saved
          </Badge>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {!preview && <FavoriteButton slug={game.slug} title={game.title} />}
          {!preview && <ReportDialog slug={game.slug} container={dialogContainer} onOpenChange={pauseForDialog} />}
        </div>
      </div>

      {portrait && !hintDismissed && (
        <Alert className="mb-4" title="Rotate your device">
          <span className="flex items-center gap-2">
            <Smartphone className="size-4 rotate-90" aria-hidden="true" /> {game.title} plays best in landscape.
            <Button variant="link" size="sm" onClick={() => setHintDismissed(true)}>
              Dismiss
            </Button>
          </span>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid content-start gap-3">
          <div
            ref={stageRef}
            className={cn('grid gap-3', fullscreen.active && 'h-full content-center bg-background p-3')}
            data-testid="game-stage"
            data-phase={phase}
          >
            <div
              className="relative mx-auto w-full overflow-hidden rounded-xl border border-border bg-[#0b1022] shadow-glow"
              style={{
                aspectRatio: String(ratio),
                width: fullscreen.active ? `min(100%, calc((100vh - 5rem) * ${ratio}))` : `min(100%, calc(72vh * ${ratio}))`,
              }}
            >
              <div ref={runner.containerRef} className="absolute inset-0" data-testid="game-container" />
              <StageOverlay runner={runner} game={game} preview={preview} scoreLabel={scoreLabel} />
            </div>

            {runner.error && (
              <Alert tone="error" title="Something went wrong" className="relative">
                <span data-testid="game-error">{runner.error}</span>
                <Button variant="ghost" size="icon" className="absolute top-2 right-2 size-7" aria-label="Dismiss" onClick={runner.dismissError}>
                  <X aria-hidden="true" />
                </Button>
              </Alert>
            )}

            <div role="toolbar" aria-label="Game controls" className="flex flex-wrap items-center gap-2" onKeyDown={shieldKeys}>
              {phase === 'running' ? (
                <Button variant="outline" onClick={runner.pause} disabled={!manifest?.supportsPause}>
                  <Pause aria-hidden="true" /> Pause
                </Button>
              ) : phase === 'paused' ? (
                <Button onClick={runner.resume}>
                  <Play aria-hidden="true" /> Resume
                </Button>
              ) : (
                <Button onClick={() => void runner.startRound()} disabled={phase !== 'ready' && phase !== 'finished'} loading={phase === 'starting'}>
                  <Play aria-hidden="true" /> {phase === 'finished' ? 'Play again' : 'Play'}
                </Button>
              )}
              <Button variant="outline" onClick={requestRestart} disabled={!inProgress && phase !== 'finished'}>
                <RotateCcw aria-hidden="true" /> Restart
              </Button>
              {inProgress && (
                <Button variant="ghost" onClick={runner.endRound}>
                  <Flag aria-hidden="true" /> End round
                </Button>
              )}
              {manifest?.supportsSound && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-pressed={runner.soundEnabled}
                  aria-label={runner.soundEnabled ? 'Mute sound' : 'Turn sound on'}
                  onClick={runner.toggleSound}
                >
                  {runner.soundEnabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
                </Button>
              )}
              {fullscreen.supported && (
                <Button variant="ghost" size="icon" aria-label={fullscreen.active ? 'Exit full screen' : 'Full screen'} onClick={() => void fullscreen.toggle()}>
                  {fullscreen.active ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
                </Button>
              )}
              <div className="ml-auto flex items-baseline gap-4 font-display tabular-nums" aria-live="off">
                <span>
                  <span className="text-xs text-muted-foreground">{scoreLabel} </span>
                  <span className="text-xl font-bold" data-testid="live-score">
                    {runner.score.toLocaleString()}
                  </span>
                </span>
                {!preview && (
                  <span>
                    <span className="text-xs text-muted-foreground">Best </span>
                    <span className="font-semibold">{best === null ? '—' : best.toLocaleString()}</span>
                  </span>
                )}
              </div>
            </div>

            <ConfirmDialog
              open={confirmRestart}
              container={dialogContainer}
              title="Restart this round?"
              description="Your current round ends now and its score is saved. A new round starts straight away."
              confirmLabel="Restart"
              cancelLabel="Keep playing"
              onCancel={() => setConfirmRestart(false)}
              onConfirm={() => {
                setConfirmRestart(false);
                void runner.startRound();
              }}
            />
          </div>

          <section aria-labelledby="how-to-play" className="glass rounded-xl border border-border p-5">
            <h2 id="how-to-play" className="font-semibold">
              How to play
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{game.instructions}</p>
          </section>
        </div>

        <aside className="grid content-start gap-4" aria-label="Game information">
          {!preview && (
            <section className="glass rounded-xl border border-border p-5" aria-labelledby="your-stats">
              <h2 id="your-stats" className="mb-3 font-semibold">
                Your stats
              </h2>
              <dl className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Best" value={best === null ? '—' : best.toLocaleString()} />
                <Stat label="Rank" value={stats?.rank ? `#${stats.rank}` : '—'} />
                <Stat label="Plays" value={String(stats?.plays ?? 0)} />
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                Level {user.level} · {user.xp.toLocaleString()} XP
              </p>
            </section>
          )}
          {manifest && manifest.controls.length > 0 && (
            <section className="glass rounded-xl border border-border p-5" aria-labelledby="controls">
              <h2 id="controls" className="mb-3 flex items-center gap-2 font-semibold">
                <Keyboard className="size-4" aria-hidden="true" /> Controls
              </h2>
              <dl className="grid gap-2 text-sm">
                {manifest.controls.map((c) => (
                  <div key={c.action} className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{c.action}</dt>
                    <dd className="text-right font-medium">{c.keys}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          {!preview && game.supportsScores && <TopPlayers slug={game.slug} scoreLabel={scoreLabel} />}
        </aside>
      </div>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Leave this game?"
        description="Your current round will end and your score so far will be saved."
        confirmLabel="Leave game"
        cancelLabel="Keep playing"
        onCancel={() => {
          blocker.reset?.();
          runner.resume();
        }}
        onConfirm={() => {
          runner.endSilently();
          blocker.proceed?.();
        }}
      />

      <RelatedGames slug={game.slug} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/60 p-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-display text-lg font-bold tabular-nums">{value}</dd>
    </div>
  );
}

function TopPlayers({ slug, scoreLabel }: { slug: string; scoreLabel: string }) {
  const { data, isPending } = useLeaderboard(slug, 'all', 5);
  return (
    <section className="glass rounded-xl border border-border p-5" aria-labelledby="top-players">
      <h2 id="top-players" className="mb-3 flex items-center gap-2 font-semibold">
        <Trophy className="size-4" aria-hidden="true" /> Top players
      </h2>
      <LeaderboardList entries={data?.entries} loading={isPending} scoreLabel={scoreLabel} />
      <Button asChild variant="link" size="sm" className="mt-3">
        <Link to={`/games/${slug}#leaderboard`}>Full leaderboard</Link>
      </Button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Overlays drawn on top of the game
// ---------------------------------------------------------------------------

function Overlay({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-[#070a17]/75 p-4 text-center text-white backdrop-blur-sm"
      role="region"
      aria-label={label}
      onKeyDown={shieldKeys}
    >
      <div className="grid max-w-md justify-items-center gap-3">{children}</div>
    </div>
  );
}

function StageOverlay({ runner, game, preview, scoreLabel }: { runner: GameRunner; game: GameDetail; preview: boolean; scoreLabel: string }) {
  switch (runner.phase) {
    case 'loading':
      return (
        <Overlay label="Loading">
          <Loader2 className="size-8 animate-spin" aria-hidden="true" />
          <p>Loading {game.title}…</p>
        </Overlay>
      );
    case 'load-error':
      return (
        <Overlay label="Load error">
          <AlertTriangle className="size-8 text-amber-400" aria-hidden="true" />
          <p>{game.title} failed to load. Check your connection and try again.</p>
          <Button onClick={runner.retryLoad}>Retry</Button>
        </Overlay>
      );
    case 'ready':
    case 'starting':
      return (
        <Overlay label="Start">
          <p className="font-display text-2xl font-bold sm:text-3xl">{game.title}</p>
          <p className="text-sm text-white/80">
            {preview ? 'Preview round: nothing is saved.' : 'Your score, stats and XP are saved when the round ends.'}
          </p>
          <Button size="lg" autoFocus onClick={() => void runner.startRound()} loading={runner.phase === 'starting'}>
            <Play aria-hidden="true" /> Play
          </Button>
        </Overlay>
      );
    case 'paused':
      return (
        <Overlay label="Paused">
          <p className="font-display text-2xl font-bold">Paused</p>
          <Button size="lg" autoFocus onClick={runner.resume}>
            <Play aria-hidden="true" /> Resume
          </Button>
        </Overlay>
      );
    case 'submitting':
      return (
        <Overlay label="Saving">
          <Loader2 className="size-8 animate-spin" aria-hidden="true" />
          <p>Saving your round…</p>
        </Overlay>
      );
    case 'finished':
      return runner.summary ? (
        <Overlay label="Round result">
          <RoundResult summary={runner.summary} slug={game.slug} scoreLabel={scoreLabel} onPlayAgain={() => void runner.startRound()} />
        </Overlay>
      ) : null;
    default:
      return null;
  }
}

function RoundResult({ summary, slug, scoreLabel, onPlayAgain }: { summary: RoundSummary; slug: string; scoreLabel: string; onPlayAgain: () => void }) {
  const { round, result, error, preview } = summary;
  return (
    <div className="grid justify-items-center gap-3" aria-live="polite" data-testid="round-result">
      <p className="font-display text-2xl font-bold sm:text-3xl">{OUTCOME_TITLES[round.outcome]}</p>
      <p>
        <span className="block text-xs tracking-wide text-white/70 uppercase">{scoreLabel}</span>
        <span className="font-display text-5xl font-bold tabular-nums">{round.score.toLocaleString()}</span>
      </p>
      {preview ? (
        <p className="text-sm text-white/80">Preview round: nothing was saved.</p>
      ) : error ? (
        <p className="rounded-md bg-rose-500/20 px-3 py-2 text-sm" role="alert">
          Your score was not saved: {error}
        </p>
      ) : result ? (
        <>
          {result.flagged && (
            <p className="rounded-md bg-amber-500/20 px-3 py-2 text-sm" role="alert">
              This round failed our plausibility checks, so it won’t count for leaderboards or XP.
            </p>
          )}
          {result.isPersonalBest && (
            <Badge variant="success" className="text-sm">
              <Trophy aria-hidden="true" /> New personal best!
            </Badge>
          )}
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-white/85">
            {result.personalBest !== null && <span>Best {result.personalBest.toLocaleString()}</span>}
            {result.rank !== null && <span>Rank #{result.rank}</span>}
            <span className="font-semibold text-cyan-300">+{result.xpAwarded} XP</span>
          </div>
          {result.leveledUp && (
            <p className="flex items-center gap-1 font-semibold text-amber-300">
              <Sparkles className="size-4" aria-hidden="true" /> Level up! You reached level {result.level}.
            </p>
          )}
          {result.xpNote && <p className="text-xs text-white/70">{result.xpNote}</p>}
        </>
      ) : null}
      <div className="mt-1 flex flex-wrap justify-center gap-2">
        <Button autoFocus onClick={onPlayAgain}>
          <RotateCcw aria-hidden="true" /> Play again
        </Button>
        <Button asChild variant="outline" className="border-white/30 text-white hover:bg-white/10">
          <Link to={`/games/${slug}`}>Game details</Link>
        </Button>
      </div>
    </div>
  );
}
