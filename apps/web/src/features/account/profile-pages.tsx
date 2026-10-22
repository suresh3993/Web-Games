import { zodResolver } from '@hookform/resolvers/zod';
import { BadgeCheck, CalendarCheck, Copy, Gamepad2, ImageUp, Pencil, Sparkles, Timer, Trash2, Trophy, User, UserRound, Swords } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { AVATAR_MAX_BYTES, IMAGE_UPLOAD_TYPES, type CurrentUser } from '@suresh/shared-types';
import { updateProfileSchema, type UpdateProfileInput } from '@suresh/validation';
import { AchievementIcon, ProgressBar, StatCard } from '@/components/data-display';
import { GameGrid } from '@/components/game/game-card';
import { Avatar } from '@/components/layout/user-menu';
import { PageShell, RequireAccount } from '@/components/page-shell';
import { QueryError } from '@/components/query-error';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Skeleton } from '@/components/ui/skeleton';
import { applyServerError } from '@/features/auth/auth-layout';
import { useFavorites, usePlayHistory } from '@/features/play/api';
import { isApiError } from '@/lib/api';
import { formatPlayTime, formatRelative, titleCase } from '@/lib/utils';
import { useDailyChallenges, useMyAchievements, useProfile, useRemoveAvatar, useUpdateProfile, useUploadAvatar } from './api';

const ROLE_LABEL = { USER: 'Player', MODERATOR: 'Moderator', ADMIN: 'Administrator' } as const;

function Section({ title, link, children }: { title: string; link?: { to: string; label: string }; children: ReactNode }) {
  return (
    <section className="glass rounded-xl border border-border p-5" aria-label={title}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        {link && (
          <Button asChild variant="link" size="sm">
            <Link to={link.to}>{link.label}</Link>
          </Button>
        )}
      </div>
      {children}
    </section>
  );
}

function ProfileHeader({ user }: { user: CurrentUser }) {
  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(user.id);
      toast.success('User ID copied.');
    } catch {
      toast.error('Could not copy. Select the ID and copy it manually.');
    }
  };
  return (
    <div className="glass flex flex-wrap items-center gap-5 rounded-xl border border-border p-6">
      <Avatar user={user} size="xl" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-bold">{user.displayName}</h2>
          {user.role !== 'USER' && <Badge variant="accent">{ROLE_LABEL[user.role]}</Badge>}
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {user.email}
          {user.emailVerified ? (
            <Badge variant="success">
              <BadgeCheck aria-hidden="true" /> Verified
            </Badge>
          ) : (
            <Badge variant="warning">Not verified</Badge>
          )}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">Member since {new Date(user.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' })}</p>
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          User ID <code className="rounded bg-muted px-1.5 py-0.5">{user.id}</code>
          <Button variant="ghost" size="icon" className="size-7" onClick={() => void copyId()} aria-label="Copy user ID">
            <Copy aria-hidden="true" />
          </Button>
        </p>
      </div>
      <Button asChild variant="outline">
        <Link to="/profile/edit">
          <Pencil aria-hidden="true" /> Edit profile
        </Link>
      </Button>
    </div>
  );
}

function ProfileContent() {
  const { data, isPending, isError, error, refetch } = useProfile();
  const achievements = useMyAchievements();
  const challenges = useDailyChallenges();
  const favorites = useFavorites();
  const history = usePlayHistory();
  if (isError) return <QueryError error={error} onRetry={() => void refetch()} />;
  if (isPending) return <Skeleton className="h-64 rounded-xl" />;
  const { user, stats } = data;
  const levelSpan = stats.nextLevelXp - stats.levelStartXp;
  const unlocked = (achievements.data ?? []).filter((a) => a.unlockedAt).sort((a, b) => b.unlockedAt!.localeCompare(a.unlockedAt!));
  const bests = (history.data ?? []).filter((h) => h.bestScore !== null);

  return (
    <div className="grid gap-6">
      <ProfileHeader user={user} />

      <section aria-label="Level" className="glass rounded-xl border border-border p-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <p className="font-display text-3xl font-bold">Level {user.level}</p>
          <p className="text-sm text-muted-foreground">
            {user.xp.toLocaleString()} XP · {(stats.nextLevelXp - user.xp).toLocaleString()} XP to level {user.level + 1}
            {stats.globalRank && <> · #{stats.globalRank} worldwide</>}
          </p>
        </div>
        <ProgressBar value={user.xp - stats.levelStartXp} max={levelSpan} label={`Progress to level ${user.level + 1}`} />
      </section>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {[
          { label: 'Rounds', value: stats.rounds.toLocaleString(), icon: Gamepad2 },
          { label: 'Games played', value: stats.gamesPlayed.toLocaleString(), icon: Sparkles },
          { label: 'Play time', value: formatPlayTime(stats.playTimeMs), icon: Timer },
          { label: 'Wins', value: stats.wins.toLocaleString(), icon: Swords },
          { label: 'Achievements', value: `${stats.achievementsUnlocked}/${stats.achievementsTotal}`, icon: Trophy },
          { label: 'Challenges', value: stats.challengesCompleted.toLocaleString(), icon: CalendarCheck },
        ].map((s) => (
          <div key={s.label}>
            <dt className="sr-only">{s.label}</dt>
            <dd>
              <StatCard label={s.label} value={s.value} icon={s.icon} />
            </dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Latest achievements" link={{ to: '/achievements', label: 'All achievements' }}>
          {unlocked.length ? (
            <ul className="grid gap-2">
              {unlocked.slice(0, 5).map((a) => (
                <li key={a.id} className="flex items-center gap-3 text-sm">
                  <span className="flex size-9 items-center justify-center rounded-full bg-amber-400/15 text-amber-400">
                    <AchievementIcon name={a.icon} className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{a.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{a.description}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{formatRelative(a.unlockedAt!)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No achievements yet: finish a round of any game to unlock your first.</p>
          )}
        </Section>

        <Section title="Today’s challenges" link={{ to: '/challenges', label: 'All challenges' }}>
          <ul className="grid gap-3">
            {(challenges.data?.challenges ?? []).map((c) => (
              <li key={c.id} className="grid gap-1 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{c.title}</span>
                  <span className="text-xs text-muted-foreground">{c.completedAt ? 'Done ✓' : `${c.progress ?? 0}/${c.target}`}</span>
                </div>
                <ProgressBar value={c.progress ?? 0} max={c.target} label={`${c.title} progress`} />
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section title="Personal bests" link={{ to: '/recently-played', label: 'Play history' }}>
        {bests.length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="pb-2 font-medium">Game</th>
                <th scope="col" className="pb-2 text-right font-medium">Best</th>
                <th scope="col" className="hidden pb-2 text-right font-medium sm:table-cell">Plays</th>
                <th scope="col" className="hidden pb-2 text-right font-medium sm:table-cell">Last played</th>
              </tr>
            </thead>
            <tbody>
              {bests.slice(0, 10).map((h) => (
                <tr key={h.game.id} className="border-t border-border">
                  <td className="py-2">
                    <Link to={`/games/${h.game.slug}`} className="hover:underline">
                      {h.game.title}
                    </Link>
                  </td>
                  <td className="py-2 text-right font-display tabular-nums">{h.bestScore!.toLocaleString()}</td>
                  <td className="hidden py-2 text-right tabular-nums sm:table-cell">{h.plays}</td>
                  <td className="hidden py-2 text-right text-muted-foreground sm:table-cell">{formatRelative(h.lastPlayedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted-foreground">Your best scores appear here once you’ve played.</p>
        )}
      </Section>

      <Section title="Favourites" link={{ to: '/favorites', label: 'All favourites' }}>
        {favorites.data?.length ? (
          <GameGrid games={favorites.data.slice(0, 4)} />
        ) : (
          <p className="text-sm text-muted-foreground">Tap the heart on a game to save it here.</p>
        )}
      </Section>
    </div>
  );
}

export function ProfilePage() {
  return (
    <PageShell icon={UserRound} title="Your profile" description="Your level, stats, achievements and favourite games.">
      <RequireAccount>{() => <ProfileContent />}</RequireAccount>
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Edit profile
// ---------------------------------------------------------------------------

function AvatarEditor({ user }: { user: CurrentUser }) {
  const upload = useUploadAvatar();
  const remove = useRemoveAvatar();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview.url);
  }, [preview]);

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setProblem(null);
    if (!file) return;
    // Friendly early checks; the server re-validates and re-encodes every upload.
    if (!(IMAGE_UPLOAD_TYPES as readonly string[]).includes(file.type)) return setProblem('Choose a PNG, JPEG, WebP or GIF image.');
    if (file.size > AVATAR_MAX_BYTES) return setProblem('That image is larger than 2 MB.');
    setPreview({ file, url: URL.createObjectURL(file) });
  };

  const save = () =>
    preview &&
    upload.mutate(preview.file, {
      onSuccess: () => {
        toast.success('Avatar updated.');
        setPreview(null);
      },
      onError: (err) => setProblem(isApiError(err) ? err.message : 'Upload failed.'),
    });

  return (
    <section className="glass grid gap-4 rounded-xl border border-border p-6" aria-labelledby="avatar-heading">
      <h2 id="avatar-heading" className="font-semibold">
        Avatar
      </h2>
      <div className="flex flex-wrap items-center gap-5">
        {preview ? <img src={preview.url} alt="New avatar preview" className="size-24 rounded-full object-cover" /> : <Avatar user={user} size="xl" />}
        <div className="grid gap-2">
          <input ref={input} type="file" accept={IMAGE_UPLOAD_TYPES.join(',')} className="sr-only" onChange={choose} aria-label="Choose an avatar image" />
          <div className="flex flex-wrap gap-2">
            {preview ? (
              <>
                <Button onClick={save} loading={upload.isPending}>
                  Save avatar
                </Button>
                <Button variant="outline" onClick={() => setPreview(null)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => input.current?.click()}>
                  <ImageUp aria-hidden="true" /> Upload image
                </Button>
                {user.avatarUrl && (
                  <Button variant="ghost" onClick={() => setConfirmRemove(true)} loading={remove.isPending}>
                    <Trash2 aria-hidden="true" /> Remove
                  </Button>
                )}
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground">PNG, JPEG, WebP or GIF, up to 2 MB, at least 64×64. We crop it to a square and remove photo metadata.</p>
        </div>
      </div>
      {problem && <Alert tone="error">{problem}</Alert>}
      <ConfirmDialog
        open={confirmRemove}
        title="Remove your avatar?"
        description="Your initials will be shown instead."
        confirmLabel="Remove"
        destructive
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          setConfirmRemove(false);
          remove.mutate(undefined, { onSuccess: () => toast.success('Avatar removed.') });
        }}
      />
    </section>
  );
}

function DisplayNameForm({ user }: { user: CurrentUser }) {
  const update = useUpdateProfile();
  const form = useForm<UpdateProfileInput>({ resolver: zodResolver(updateProfileSchema), defaultValues: { displayName: user.displayName } });
  const submit = form.handleSubmit((values) =>
    update.mutateAsync(values).then(
      () => toast.success('Display name updated.'),
      (err) => applyServerError(err, form.setError, ['displayName']),
    ),
  );
  return (
    <form onSubmit={submit} noValidate className="glass grid gap-4 rounded-xl border border-border p-6" aria-labelledby="name-heading">
      <h2 id="name-heading" className="font-semibold">
        Display name
      </h2>
      <FormField
        label="Display name"
        autoComplete="nickname"
        maxLength={32}
        error={form.formState.errors.displayName?.message}
        hint="Shown on leaderboards. 2–32 letters, numbers, spaces, dots, dashes or underscores."
        {...form.register('displayName')}
      />
      {form.formState.errors.root?.server && <Alert tone="error">{form.formState.errors.root.server.message}</Alert>}
      <div>
        <Button type="submit" loading={update.isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}

export function EditProfilePage() {
  return (
    <PageShell
      icon={User}
      title="Edit profile"
      description={
        <>
          Your public identity on SURESH. Account security lives in <Link to="/settings" className="underline">Settings</Link>.
        </>
      }
    >
      <RequireAccount>
        {(user) => (
          <div className="grid max-w-2xl gap-6">
            <AvatarEditor user={user} />
            <DisplayNameForm user={user} />
            <p className="text-sm text-muted-foreground">
              Role: {titleCase(user.role)} · Email: {user.email}
            </p>
          </div>
        )}
      </RequireAccount>
    </PageShell>
  );
}
