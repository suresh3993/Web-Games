import { CalendarPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import {
  ACHIEVEMENT_CRITERIA_TYPES,
  ACHIEVEMENT_ICONS,
  CHALLENGE_TYPES,
  type AchievementCriteria,
  type AdminAchievement,
  type AdminChallenge,
  type ChallengeType,
} from '@suresh/shared-types';
import { achievementInputSchema, challengeInputSchema, flattenZodError } from '@suresh/validation';
import { AchievementIcon } from '@/components/data-display';
import { EmptyState } from '@/components/empty-state';
import { QueryError } from '@/components/query-error';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Checkbox, Field, Select, Textarea } from '@/components/ui/fields';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { isApiError } from '@/lib/api';
import { AdminHeader, TableShell, tdClass, thClass } from './admin-layout';
import { useAdminAchievements, useAdminCategories, useAdminChallenges, useDeleteAchievement, useDeleteChallenge, useSaveAchievement, useSaveChallenge } from './api';

const CRITERIA_LABEL: Record<AchievementCriteria['type'], string> = {
  rounds_played: 'Finish N rounds',
  distinct_games: 'Play N different games',
  wins: 'Win N rounds (optionally of one game)',
  score_at_least: 'Reach a score in one game',
  level_reached: 'Reach a level',
  play_minutes: 'Play N minutes in total',
  category_games: 'Play N different games of a category',
  daily_challenges: 'Complete N daily challenges',
};

export function describeCriteria(c: AchievementCriteria): string {
  switch (c.type) {
    case 'rounds_played':
      return `Finish ${c.count} rounds`;
    case 'distinct_games':
      return `Play ${c.count} different games`;
    case 'wins':
      return c.game ? `Win ${c.count}× in ${c.game}` : `Win ${c.count} rounds`;
    case 'score_at_least':
      return `Score ${c.value.toLocaleString()} in ${c.game}`;
    case 'level_reached':
      return `Reach level ${c.level}`;
    case 'play_minutes':
      return `Play ${c.minutes} minutes`;
    case 'category_games':
      return `Play ${c.count} ${c.category} games`;
    case 'daily_challenges':
      return `Complete ${c.count} daily challenges`;
  }
}

/** Server-side errors arrive keyed by field path; show the first per field. */
const firstErrors = (fields: Record<string, string[]>) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v[0]]));

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

interface AchievementDraft {
  key: string;
  name: string;
  description: string;
  icon: string;
  xpReward: number;
  isActive: boolean;
  type: AchievementCriteria['type'];
  amount: number;
  game: string;
  category: string;
}

function toDraft(a: AdminAchievement | null): AchievementDraft {
  const c = a?.criteria;
  const amount = !c ? 1 : c.type === 'score_at_least' ? c.value : c.type === 'level_reached' ? c.level : c.type === 'play_minutes' ? c.minutes : c.count;
  return {
    key: a?.key ?? '',
    name: a?.name ?? '',
    description: a?.description ?? '',
    icon: a?.icon ?? 'Trophy',
    xpReward: a?.xpReward ?? 50,
    isActive: a?.isActive ?? true,
    type: c?.type ?? 'rounds_played',
    amount,
    game: c && (c.type === 'wins' || c.type === 'score_at_least') ? (c.game ?? '') : '',
    category: c?.type === 'category_games' ? c.category : 'puzzle',
  };
}

function toCriteria(d: AchievementDraft): unknown {
  switch (d.type) {
    case 'score_at_least':
      return { type: d.type, game: d.game.trim(), value: d.amount };
    case 'level_reached':
      return { type: d.type, level: d.amount };
    case 'play_minutes':
      return { type: d.type, minutes: d.amount };
    case 'category_games':
      return { type: d.type, category: d.category, count: d.amount };
    case 'wins':
      return { type: d.type, count: d.amount, ...(d.game.trim() ? { game: d.game.trim() } : {}) };
    default:
      return { type: d.type, count: d.amount };
  }
}

function AchievementDialog({ achievement, onClose }: { achievement: AdminAchievement | null; onClose: () => void }) {
  const save = useSaveAchievement();
  const categories = useAdminCategories();
  const [draft, setDraft] = useState(() => toDraft(achievement));
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const set = <K extends keyof AchievementDraft>(key: K, value: AchievementDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const amountLabel = { score_at_least: 'Score', level_reached: 'Level', play_minutes: 'Minutes' }[draft.type as string] ?? 'How many';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const candidate = { key: draft.key, name: draft.name, description: draft.description, icon: draft.icon, xpReward: draft.xpReward, isActive: draft.isActive, criteria: toCriteria(draft) };
    const parsed = achievementInputSchema.safeParse(candidate);
    if (!parsed.success) return setErrors(firstErrors(flattenZodError(parsed.error)));
    setErrors({});
    const { key, ...update } = parsed.data;
    save.mutate(
      { id: achievement?.id, input: achievement ? update : parsed.data },
      {
        onSuccess: () => {
          toast.success(achievement ? 'Achievement saved.' : `Achievement “${key}” created.`);
          onClose();
        },
        onError: (err) => setErrors(isApiError(err) && Object.keys(err.fields).length ? firstErrors(err.fields) : { _root: isApiError(err) ? err.message : 'Save failed.' }),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogTitle>{achievement ? `Edit ${achievement.name}` : 'New achievement'}</DialogTitle>
        <DialogDescription>Players unlock it automatically the next time a round meets the rule. XP is awarded once.</DialogDescription>
        <form onSubmit={submit} noValidate className="grid max-h-[70vh] gap-4 overflow-y-auto pr-1">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Key" disabled={Boolean(achievement)} value={draft.key} onChange={(e) => set('key', e.target.value)} error={errors.key} hint="Stable id, e.g. snake-master" />
            <FormField label="Name" value={draft.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
          </div>
          <Field label="Description" error={errors.description}>
            {({ id, describedBy, invalid }) => <Textarea id={id} aria-describedby={describedBy} aria-invalid={invalid} rows={2} value={draft.description} onChange={(e) => set('description', e.target.value)} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Icon">
              {({ id }) => (
                <div className="flex items-center gap-2">
                  <AchievementIcon name={draft.icon} className="size-5 shrink-0" />
                  <Select id={id} value={draft.icon} onChange={(e) => set('icon', e.target.value)}>
                    {ACHIEVEMENT_ICONS.map((i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </Field>
            <FormField label="XP reward" type="number" min={0} max={1000} value={draft.xpReward} onChange={(e) => set('xpReward', e.target.valueAsNumber || 0)} error={errors.xpReward} />
          </div>
          <Field label="Rule" error={errors['criteria.type']}>
            {({ id }) => (
              <Select id={id} value={draft.type} onChange={(e) => set('type', e.target.value as AchievementDraft['type'])}>
                {ACHIEVEMENT_CRITERIA_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {CRITERIA_LABEL[t]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label={amountLabel}
              type="number"
              min={1}
              value={draft.amount}
              onChange={(e) => set('amount', e.target.valueAsNumber || 0)}
              error={errors['criteria.count'] ?? errors['criteria.value'] ?? errors['criteria.level'] ?? errors['criteria.minutes']}
            />
            {(draft.type === 'wins' || draft.type === 'score_at_least') && (
              <FormField
                label={draft.type === 'wins' ? 'Game slug (optional)' : 'Game slug'}
                value={draft.game}
                onChange={(e) => set('game', e.target.value)}
                error={errors['criteria.game']}
                hint="e.g. snake"
              />
            )}
            {draft.type === 'category_games' && (
              <Field label="Category" error={errors['criteria.category']}>
                {({ id }) => (
                  <Select id={id} value={draft.category} onChange={(e) => set('category', e.target.value)}>
                    {categories.data?.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
          </div>
          <Checkbox label="Active (players can unlock it)" checked={draft.isActive} onChange={(e) => set('isActive', e.target.checked)} />
          {errors._root && <Alert tone="error">{errors._root}</Alert>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {achievement ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AdminAchievementsPage() {
  const { data, isPending, isError, error, refetch } = useAdminAchievements();
  const remove = useDeleteAchievement();
  const [editing, setEditing] = useState<AdminAchievement | 'new' | null>(null);
  const [deleting, setDeleting] = useState<AdminAchievement | null>(null);
  return (
    <>
      <AdminHeader
        title="Achievements"
        description="Rules are evaluated on the server from recorded rounds. Deactivate an achievement instead of deleting it once players have it."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus aria-hidden="true" /> New achievement
          </Button>
        }
      />
      {isError ? (
        <QueryError error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <TableShell label="Achievements">
          <thead>
            <tr>
              <th scope="col" className={thClass}>Achievement</th>
              <th scope="col" className={thClass}>Rule</th>
              <th scope="col" className={thClass}>XP</th>
              <th scope="col" className={thClass}>Unlocked by</th>
              <th scope="col" className={thClass}>Status</th>
              <th scope="col" className={thClass}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {data.map((a) => (
              <tr key={a.id} className="border-t border-border">
                <td className={tdClass}>
                  <div className="flex items-center gap-2">
                    <AchievementIcon name={a.icon} className="size-4 text-amber-400" />
                    <div>
                      <p className="font-medium">{a.name}</p>
                      <p className="text-xs text-muted-foreground">{a.key}</p>
                    </div>
                  </div>
                </td>
                <td className={tdClass}>{describeCriteria(a.criteria)}</td>
                <td className={`${tdClass} tabular-nums`}>{a.xpReward}</td>
                <td className={`${tdClass} tabular-nums`}>{a.unlockedBy}</td>
                <td className={tdClass}>{a.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="outline">Inactive</Badge>}</td>
                <td className={`${tdClass} text-right`}>
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => setEditing(a)}>
                      <Pencil aria-hidden="true" /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Delete ${a.name}`} onClick={() => setDeleting(a)}>
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      {editing && <AchievementDialog achievement={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? ''}?`}
        description="Achievements that players have unlocked can’t be deleted; deactivate them instead."
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const a = deleting!;
          setDeleting(null);
          remove.mutate(a.id, { onSuccess: () => toast.success('Achievement deleted.'), onError: (err) => toast.error(isApiError(err) ? err.message : 'Delete failed.') });
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Daily challenges
// ---------------------------------------------------------------------------

const TYPE_LABEL: Record<ChallengeType, string> = {
  PLAY_GAMES: 'Finish rounds',
  REACH_SCORE: 'Reach a score',
  PLAY_MINUTES: 'Play minutes',
  PLAY_CATEGORY: 'Rounds in a category',
};

const todayKey = () => new Date().toISOString().slice(0, 10);

interface ChallengeDraft {
  date: string;
  title: string;
  description: string;
  type: ChallengeType;
  target: number;
  xpReward: number;
  game: string;
  category: string;
}

function ChallengeDialog({ challenge, onClose }: { challenge: AdminChallenge | null; onClose: () => void }) {
  const save = useSaveChallenge();
  const categories = useAdminCategories();
  const [draft, setDraft] = useState<ChallengeDraft>({
    date: challenge?.date ?? todayKey(),
    title: challenge?.title ?? '',
    description: challenge?.description ?? '',
    type: challenge?.type ?? 'PLAY_GAMES',
    target: challenge?.target ?? 3,
    xpReward: challenge?.xpReward ?? 40,
    game: challenge?.game?.slug ?? '',
    category: challenge?.category?.slug ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const set = <K extends keyof ChallengeDraft>(key: K, value: ChallengeDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const candidate = {
      ...draft,
      game: draft.game.trim() || null,
      category: draft.type === 'PLAY_CATEGORY' ? draft.category || null : null,
    };
    const parsed = challengeInputSchema.safeParse(candidate);
    if (!parsed.success) return setErrors(firstErrors(flattenZodError(parsed.error)));
    setErrors({});
    const { date: _date, ...update } = parsed.data;
    save.mutate(
      { id: challenge?.id, input: challenge ? update : parsed.data },
      {
        onSuccess: () => {
          toast.success(challenge ? 'Challenge saved.' : 'Challenge scheduled.');
          onClose();
        },
        onError: (err) => setErrors(isApiError(err) && Object.keys(err.fields).length ? firstErrors(err.fields) : { _root: isApiError(err) ? err.message : 'Save failed.' }),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogTitle>{challenge ? 'Edit challenge' : 'Schedule a challenge'}</DialogTitle>
        <DialogDescription>Days that have challenges created here don’t get automatic ones. Progress is computed from rounds finished that UTC day.</DialogDescription>
        <form onSubmit={submit} noValidate className="grid max-h-[70vh] gap-4 overflow-y-auto pr-1">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Date (UTC)" type="date" disabled={Boolean(challenge)} value={draft.date} onChange={(e) => set('date', e.target.value)} error={errors.date} />
            <Field label="Type">
              {({ id }) => (
                <Select id={id} value={draft.type} onChange={(e) => set('type', e.target.value as ChallengeType)}>
                  {CHALLENGE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <FormField label="Title" value={draft.title} onChange={(e) => set('title', e.target.value)} error={errors.title} />
          <Field label="Description" error={errors.description}>
            {({ id, describedBy, invalid }) => <Textarea id={id} aria-describedby={describedBy} aria-invalid={invalid} rows={2} value={draft.description} onChange={(e) => set('description', e.target.value)} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={draft.type === 'REACH_SCORE' ? 'Score' : draft.type === 'PLAY_MINUTES' ? 'Minutes' : 'Rounds'} type="number" min={1} value={draft.target} onChange={(e) => set('target', e.target.valueAsNumber || 0)} error={errors.target} />
            <FormField label="XP reward" type="number" min={0} max={500} value={draft.xpReward} onChange={(e) => set('xpReward', e.target.valueAsNumber || 0)} error={errors.xpReward} />
          </div>
          {(draft.type === 'PLAY_GAMES' || draft.type === 'REACH_SCORE') && (
            <FormField
              label={draft.type === 'REACH_SCORE' ? 'Game slug' : 'Game slug (optional: any game if empty)'}
              value={draft.game}
              onChange={(e) => set('game', e.target.value)}
              error={errors.game}
              hint="e.g. snake"
            />
          )}
          {draft.type === 'PLAY_CATEGORY' && (
            <Field label="Category" error={errors.category}>
              {({ id }) => (
                <Select id={id} value={draft.category} onChange={(e) => set('category', e.target.value)}>
                  <option value="">Choose…</option>
                  {categories.data?.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          {errors._root && <Alert tone="error">{errors._root}</Alert>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {challenge ? 'Save' : 'Schedule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const shiftDays = (day: string, days: number) => new Date(new Date(`${day}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);

export function AdminChallengesPage() {
  const [from, setFrom] = useState(() => shiftDays(todayKey(), -7));
  const [to, setTo] = useState(() => shiftDays(todayKey(), 7));
  const { data, isPending, isError, error, refetch } = useAdminChallenges({ from, to });
  const remove = useDeleteChallenge();
  const [editing, setEditing] = useState<AdminChallenge | 'new' | null>(null);
  const [deleting, setDeleting] = useState<AdminChallenge | null>(null);
  return (
    <>
      <AdminHeader
        title="Daily challenges"
        description="Each UTC day gets three automatic challenges on first use unless you schedule your own for that day."
        actions={
          <Button onClick={() => setEditing('new')}>
            <CalendarPlus aria-hidden="true" /> Schedule challenge
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">
          From
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
        </label>
        <label className="grid gap-1 text-sm">
          To
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" />
        </label>
      </div>
      {isError ? (
        <QueryError error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : data.length === 0 ? (
        <EmptyState icon={CalendarPlus} title="No challenges in this range" description="Automatic challenges are created when players first open a day’s challenges." />
      ) : (
        <TableShell label="Daily challenges">
          <thead>
            <tr>
              <th scope="col" className={thClass}>Date</th>
              <th scope="col" className={thClass}>Challenge</th>
              <th scope="col" className={thClass}>Goal</th>
              <th scope="col" className={thClass}>XP</th>
              <th scope="col" className={thClass}>Completed</th>
              <th scope="col" className={thClass}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className={`${tdClass} whitespace-nowrap`}>
                  {c.date} {c.date === todayKey() && <Badge variant="success">Today</Badge>}
                </td>
                <td className={tdClass}>
                  <p className="font-medium">{c.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.key.startsWith('auto-') ? 'Automatic' : 'Scheduled'} · {c.description}
                  </p>
                </td>
                <td className={tdClass}>
                  {TYPE_LABEL[c.type]}: {c.target.toLocaleString()}
                  {c.game && <> · {c.game.title}</>}
                  {c.category && <> · {c.category.name}</>}
                </td>
                <td className={`${tdClass} tabular-nums`}>{c.xpReward}</td>
                <td className={`${tdClass} tabular-nums`}>
                  {c.completions} / {c.participants}
                </td>
                <td className={`${tdClass} text-right`}>
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => setEditing(c)}>
                      <Pencil aria-hidden="true" /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Delete ${c.title}`} onClick={() => setDeleting(c)}>
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      {editing && <ChallengeDialog challenge={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete “${deleting?.title ?? ''}”?`}
        description="Challenges that players have completed can’t be deleted."
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const c = deleting!;
          setDeleting(null);
          remove.mutate(c.id, { onSuccess: () => toast.success('Challenge deleted.'), onError: (err) => toast.error(isApiError(err) ? err.message : 'Delete failed.') });
        }}
      />
    </>
  );
}
