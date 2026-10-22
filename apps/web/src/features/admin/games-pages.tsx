import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Check, Eye, ImageUp, Plus, Search, Star, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { DEVICE_TYPES, DIFFICULTIES, GAME_STATUSES, IMAGE_UPLOAD_TYPES, THUMBNAIL_MAX_BYTES, type AdminGameDetail, type GameStatus } from '@playverse/shared-types';
import { adminGameCreateSchema, z, type AdminGameCreate } from '@playverse/validation';
import { Pagination } from '@/components/data-display';
import { GameArt } from '@/components/game/game-art';
import { QueryError } from '@/components/query-error';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Checkbox, Field, Select, Textarea } from '@/components/ui/fields';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/features/auth/api';
import { applyServerError } from '@/features/auth/auth-layout';
import { isApiError } from '@/lib/api';
import { formatRelative, titleCase } from '@/lib/utils';
import { AdminHeader, isAdmin, TableShell, tdClass, thClass } from './admin-layout';
import { useAdminCategories, useAdminGame, useAdminGames, useCreateGame, useDeleteGame, useGameThumbnail, useUpdateGame } from './api';

const STATUS_VARIANT: Record<GameStatus, 'success' | 'primary' | 'outline' | 'warning'> = {
  PUBLISHED: 'success',
  COMING_SOON: 'primary',
  DRAFT: 'outline',
  UNPUBLISHED: 'warning',
};

export const statusLabel = (s: GameStatus) => titleCase(s.replace('_', ' '));

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export function AdminGamesPage() {
  const { data: me } = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const categories = useAdminCategories();
  const q = {
    q: params.get('q') || undefined,
    status: params.get('status') || undefined,
    category: params.get('category') || undefined,
    sort: params.get('sort') || 'title',
    page: Number(params.get('page') ?? 1),
    pageSize: 50,
  };
  const { data, isPending, isError, error, refetch } = useAdminGames(q);
  const update = (next: Record<string, string | undefined>) => {
    const merged = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) if (v) merged.set(k, v);
    else merged.delete(k);
    if (!('page' in next)) merged.delete('page');
    setParams(merged, { replace: true });
  };

  return (
    <>
      <AdminHeader
        title="Games"
        description="Catalog entries in every status. A game can be published once its runtime was launched and finished in preview on this site."
        actions={
          isAdmin(me) && (
            <Button asChild>
              <Link to="/admin/games/new">
                <Plus aria-hidden="true" /> New game
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <form
          role="search"
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: search.trim() || undefined });
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input aria-label="Search games" placeholder="Title or slug…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>
        <Select aria-label="Status" value={q.status ?? ''} onChange={(e) => update({ status: e.target.value || undefined })}>
          <option value="">All statuses</option>
          {GAME_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </Select>
        <Select aria-label="Category" value={q.category ?? ''} onChange={(e) => update({ category: e.target.value || undefined })}>
          <option value="">All categories</option>
          {categories.data?.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Sort" value={q.sort} onChange={(e) => update({ sort: e.target.value })}>
          <option value="title">Title</option>
          <option value="updated">Recently updated</option>
          <option value="popular">Most played</option>
          <option value="status">Status</option>
        </Select>
      </div>
      {isError ? (
        <QueryError error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">{data.meta.total.toLocaleString()} games</p>
          <TableShell label="Games">
            <thead>
              <tr>
                <th scope="col" className={thClass}>Game</th>
                <th scope="col" className={thClass}>Status</th>
                <th scope="col" className={thClass}>Runtime</th>
                <th scope="col" className={thClass}>Preview tested</th>
                <th scope="col" className={thClass}>Plays</th>
                <th scope="col" className={thClass}>Updated</th>
                <th scope="col" className={thClass}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((g) => (
                <tr key={g.id} className="border-t border-border">
                  <td className={tdClass}>
                    <p className="flex items-center gap-1 font-medium">
                      {g.title} {g.isFeatured && <Star className="size-3.5 fill-amber-400 text-amber-400" aria-label="Featured" />}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {g.slug} · {g.primaryCategory.name} · {g.engine}
                    </p>
                  </td>
                  <td className={tdClass}>
                    <Badge variant={STATUS_VARIANT[g.status]}>{statusLabel(g.status)}</Badge>
                  </td>
                  <td className={tdClass}>{g.runtimeKey ? <Check className="size-4 text-success" aria-label="Has a runtime" /> : <span className="text-xs text-muted-foreground">Planned</span>}</td>
                  <td className={tdClass}>{g.previewTested ? <Check className="size-4 text-success" aria-label="Tested" /> : <span className="text-xs text-muted-foreground">Not yet</span>}</td>
                  <td className={`${tdClass} tabular-nums`}>{g.playCount.toLocaleString()}</td>
                  <td className={tdClass}>{formatRelative(g.updatedAt)}</td>
                  <td className={`${tdClass} text-right`}>
                    <div className="flex justify-end gap-1">
                      {g.runtimeKey && (
                        <Button asChild size="sm" variant="ghost">
                          <Link to={`/games/${g.slug}/play?preview=1`} aria-label={`Preview ${g.title}`}>
                            <Eye aria-hidden="true" />
                          </Link>
                        </Button>
                      )}
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/admin/games/${g.id}`}>{isAdmin(me) ? 'Edit' : 'View'}</Link>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
          <Pagination meta={data.meta} onPage={(page) => update({ page: String(page) })} />
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Create / edit
// ---------------------------------------------------------------------------

const metadataSchema = adminGameCreateSchema.omit({ slug: true, engine: true, status: true });
type MetadataForm = z.input<typeof metadataSchema>;
type MetadataValues = z.output<typeof metadataSchema>;
const createFormSchema = adminGameCreateSchema;
type CreateForm = z.input<typeof createFormSchema>;
type MetadataFormApi = UseFormReturn<MetadataForm, unknown, MetadataValues>;

function MetadataFields({ form, disabled }: { form: MetadataFormApi | UseFormReturn<CreateForm, unknown, AdminGameCreate>; disabled?: boolean }) {
  const categories = useAdminCategories();
  // Both form types share these fields; narrow once for registration.
  const f = form as unknown as MetadataFormApi;
  const { errors } = f.formState;
  const primary = f.watch('primaryCategory');
  return (
    <fieldset disabled={disabled} className="grid gap-4 disabled:opacity-80">
      <FormField label="Title" error={errors.title?.message} {...f.register('title')} />
      <FormField label="Short description" hint="One sentence for cards (max 280 characters)." error={errors.shortDescription?.message} {...f.register('shortDescription')} />
      <Field label="Description" error={errors.description?.message}>
        {({ id, describedBy, invalid }) => <Textarea id={id} aria-describedby={describedBy} aria-invalid={invalid} rows={4} {...f.register('description')} />}
      </Field>
      <Field label="How to play" error={errors.instructions?.message}>
        {({ id, describedBy, invalid }) => <Textarea id={id} aria-describedby={describedBy} aria-invalid={invalid} rows={3} {...f.register('instructions')} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Difficulty">
          {({ id }) => (
            <Select id={id} {...f.register('difficulty')}>
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {titleCase(d)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <FormField label="Typical session (minutes)" type="number" min={1} max={240} error={errors.estimatedMinutes?.message} {...f.register('estimatedMinutes', { valueAsNumber: true })} />
      </div>
      <Field label="Main category" error={errors.primaryCategory?.message}>
        {({ id }) => (
          <Select id={id} {...f.register('primaryCategory')}>
            {categories.data?.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Also listed in</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {categories.data
            ?.filter((c) => c.slug !== primary)
            .map((c) => <Checkbox key={c.slug} label={c.name} value={c.slug} {...f.register('extraCategories')} />)}
        </div>
      </fieldset>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Supported devices</legend>
        <div className="flex flex-wrap gap-4">
          {DEVICE_TYPES.map((d) => (
            <Checkbox key={d} label={titleCase(d)} value={d} {...f.register('supportedDevices')} />
          ))}
        </div>
        {errors.supportedDevices && (
          <p role="alert" className="text-xs text-destructive">
            Choose at least one device.
          </p>
        )}
      </fieldset>
      <div className="flex flex-wrap gap-6">
        <Checkbox label="Featured on the home page" {...f.register('isFeatured')} />
        <Checkbox label="Keeps scores and leaderboards" {...f.register('supportsScores')} />
      </div>
    </fieldset>
  );
}

const toMetadata = (g: AdminGameDetail): MetadataForm => ({
  title: g.title,
  shortDescription: g.shortDescription,
  description: g.description,
  instructions: g.instructions,
  difficulty: g.difficulty,
  supportedDevices: g.supportedDevices,
  estimatedMinutes: g.estimatedMinutes,
  primaryCategory: g.primaryCategory.slug,
  extraCategories: g.categories.filter((c) => c !== g.primaryCategory.slug),
  isFeatured: g.isFeatured,
  supportsScores: g.supportsScores,
});

function StatusPanel({ game, canEdit }: { game: AdminGameDetail; canEdit: boolean }) {
  const update = useUpdateGame(game.id);
  const [target, setTarget] = useState<GameStatus | null>(null);
  const publishBlocker = !game.runtimeKey
    ? 'This game has no runtime module yet.'
    : !game.previewTested
      ? 'Launch it in preview and finish a round first: that is how we know its launch flow works here.'
      : null;
  const actions: { status: GameStatus; label: string; hint: string }[] = [
    { status: 'PUBLISHED', label: 'Publish', hint: 'Players can launch it and it appears as playable.' },
    { status: 'COMING_SOON', label: 'Mark coming soon', hint: 'Visible in the catalog, not playable.' },
    { status: 'UNPUBLISHED', label: 'Unpublish', hint: 'Hidden from players; scores and history are kept.' },
    { status: 'DRAFT', label: 'Move to drafts', hint: 'Hidden work in progress.' },
  ];
  return (
    <section aria-labelledby="status-heading" className="glass grid gap-3 rounded-xl border border-border p-5">
      <h2 id="status-heading" className="font-semibold">
        Status: <Badge variant={STATUS_VARIANT[game.status]}>{statusLabel(game.status)}</Badge>
      </h2>
      {game.publishedAt && <p className="text-xs text-muted-foreground">First published {new Date(game.publishedAt).toLocaleString()}</p>}
      {game.runtimeKey && (
        <Button asChild variant="outline" size="sm" className="w-fit">
          <Link to={`/games/${game.slug}/play?preview=1`}>
            <Eye aria-hidden="true" /> Preview this game (not scored)
          </Link>
        </Button>
      )}
      {canEdit && (
        <div className="grid gap-2">
          {actions
            .filter((a) => a.status !== game.status)
            .map((a) => (
              <div key={a.status} className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={a.status === 'PUBLISHED' ? 'primary' : 'outline'}
                  disabled={a.status === 'PUBLISHED' && Boolean(publishBlocker)}
                  onClick={() => setTarget(a.status)}
                  loading={update.isPending && target === a.status}
                >
                  {a.label}
                </Button>
                <span className="text-xs text-muted-foreground">{a.status === 'PUBLISHED' && publishBlocker ? publishBlocker : a.hint}</span>
              </div>
            ))}
        </div>
      )}
      <ConfirmDialog
        open={target !== null}
        title={target ? `${actions.find((a) => a.status === target)!.label}: ${game.title}?` : ''}
        description={target ? actions.find((a) => a.status === target)!.hint : ''}
        confirmLabel="Confirm"
        destructive={target === 'UNPUBLISHED' || target === 'DRAFT'}
        onCancel={() => setTarget(null)}
        onConfirm={() => {
          const status = target!;
          setTarget(null);
          update.mutate({ status }, { onSuccess: () => toast.success(`Status changed to ${statusLabel(status)}.`), onError: (err) => toast.error(isApiError(err) ? err.message : 'Failed.') });
        }}
      />
    </section>
  );
}

function ThumbnailPanel({ game, canEdit }: { game: AdminGameDetail; canEdit: boolean }) {
  const { upload, remove } = useGameThumbnail(game.id);
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const choose = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setProblem(null);
    if (!file) return;
    if (!(IMAGE_UPLOAD_TYPES as readonly string[]).includes(file.type)) return setProblem('Choose a PNG, JPEG, WebP or GIF image.');
    if (file.size > THUMBNAIL_MAX_BYTES) return setProblem('That image is larger than 5 MB.');
    upload.mutate(file, { onSuccess: () => toast.success('Thumbnail updated.'), onError: (err) => setProblem(isApiError(err) ? err.message : 'Upload failed.') });
  };
  return (
    <section aria-labelledby="thumb-heading" className="glass grid gap-3 rounded-xl border border-border p-5">
      <h2 id="thumb-heading" className="font-semibold">
        Thumbnail
      </h2>
      <div className="overflow-hidden rounded-lg border border-border">
        <GameArt
          slug={game.slug}
          title={game.title}
          accentColor="#7c5cff"
          icon="Gamepad2"
          thumbnailUrl={game.thumbnailUrl}
          thumbnailSrcSet={game.thumbnailSrcSet}
        />
      </div>
      <p className="text-xs text-muted-foreground">16:10 works best (at least 320×200). We crop and convert it to WebP in three sizes. Without one, cards show generated artwork.</p>
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <input ref={input} type="file" accept={IMAGE_UPLOAD_TYPES.join(',')} className="sr-only" onChange={choose} aria-label="Choose a thumbnail image" />
          <Button size="sm" variant="outline" onClick={() => input.current?.click()} loading={upload.isPending}>
            <ImageUp aria-hidden="true" /> Upload
          </Button>
          {game.thumbnailUrl && (
            <Button size="sm" variant="ghost" onClick={() => remove.mutate(undefined, { onSuccess: () => toast.success('Thumbnail removed.') })} loading={remove.isPending}>
              <Trash2 aria-hidden="true" /> Remove
            </Button>
          )}
        </div>
      )}
      {problem && <Alert tone="error">{problem}</Alert>}
    </section>
  );
}

function DeletePanel({ game }: { game: AdminGameDetail }) {
  const remove = useDeleteGame();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  return (
    <section aria-labelledby="delete-heading" className="grid gap-3 rounded-xl border border-destructive/40 p-5">
      <h2 id="delete-heading" className="font-semibold">
        Delete game
      </h2>
      <p className="text-sm text-muted-foreground">Only unpublished games without play history or reports can be deleted. Otherwise, unpublish instead.</p>
      <div>
        <Button size="sm" variant="destructive" onClick={() => setOpen(true)}>
          <Trash2 aria-hidden="true" /> Delete…
        </Button>
      </div>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          setTyped('');
        }}
      >
        <DialogContent>
          <DialogTitle>Delete {game.title}?</DialogTitle>
          <DialogDescription>
            This removes the catalog entry permanently. Type <strong>{game.slug}</strong> to confirm.
          </DialogDescription>
          <Input aria-label="Type the game slug to confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={typed !== game.slug}
              loading={remove.isPending}
              onClick={() =>
                remove.mutate(game.id, {
                  onSuccess: () => {
                    toast.success('Game deleted.');
                    navigate('/admin/games');
                  },
                  onError: (err) => {
                    setOpen(false);
                    toast.error(isApiError(err) ? err.message : 'Delete failed.');
                  },
                })
              }
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Back() {
  return (
    <Button asChild variant="link" className="mb-2">
      <Link to="/admin/games">
        <ArrowLeft aria-hidden="true" /> All games
      </Link>
    </Button>
  );
}

function EditForm({ game, canEdit }: { game: AdminGameDetail; canEdit: boolean }) {
  const update = useUpdateGame(game.id);
  const form = useForm<MetadataForm, unknown, MetadataValues>({ resolver: zodResolver(metadataSchema), defaultValues: toMetadata(game) });
  useEffect(() => form.reset(toMetadata(game)), [game, form]);
  const submit = form.handleSubmit((values) =>
    update.mutateAsync(values).then(
      () => toast.success('Changes saved.'),
      (err) => applyServerError(err, form.setError, ['title', 'shortDescription', 'description', 'instructions', 'primaryCategory', 'extraCategories', 'estimatedMinutes']),
    ),
  );
  return (
    <form onSubmit={submit} noValidate className="glass grid gap-4 rounded-xl border border-border p-5">
      <MetadataFields form={form} disabled={!canEdit} />
      {form.formState.errors.root?.server && <Alert tone="error">{form.formState.errors.root.server.message}</Alert>}
      {canEdit && (
        <div>
          <Button type="submit" loading={update.isPending}>
            Save changes
          </Button>
        </div>
      )}
    </form>
  );
}

export function AdminGameEditPage() {
  const { id } = useParams();
  const { data: me } = useCurrentUser();
  const { data: game, isPending, isError, error, refetch } = useAdminGame(id);
  const canEdit = isAdmin(me);
  if (isError) return <QueryError error={error} onRetry={() => void refetch()} />;
  if (isPending) return <Skeleton className="h-96 rounded-xl" />;
  const facts: [string, ReactNode][] = [
    ['Slug', <code key="s">{game.slug}</code>],
    ['Engine', game.engine],
    ['Runtime module', game.runtimeKey ?? 'None yet'],
    ['Score ceiling', game.maxScore?.toLocaleString() ?? '—'],
    ['Plays', game.playCount.toLocaleString()],
    ['Licence', game.licenseType],
  ];
  return (
    <>
      <Back />
      <AdminHeader title={game.title} description={canEdit ? 'Edit catalog details, status and artwork.' : 'Read-only: only administrators can change games.'} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <EditForm game={game} canEdit={canEdit} />
        <div className="grid content-start gap-6">
          <StatusPanel game={game} canEdit={canEdit} />
          <ThumbnailPanel game={game} canEdit={canEdit} />
          <section aria-labelledby="facts" className="glass rounded-xl border border-border p-5 text-sm">
            <h2 id="facts" className="mb-2 font-semibold">
              Details
            </h2>
            <dl className="grid gap-1">
              {facts.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
          {canEdit && <DeletePanel game={game} />}
        </div>
      </div>
    </>
  );
}

export function AdminGameCreatePage() {
  const { data: me } = useCurrentUser();
  const create = useCreateGame();
  const navigate = useNavigate();
  const form = useForm<CreateForm, unknown, AdminGameCreate>({
    resolver: zodResolver(createFormSchema),
    defaultValues: {
      slug: '',
      engine: 'DOM',
      status: 'DRAFT',
      title: '',
      shortDescription: '',
      description: '',
      instructions: '',
      difficulty: 'EASY',
      supportedDevices: ['DESKTOP', 'TABLET', 'MOBILE'],
      estimatedMinutes: 5,
      primaryCategory: 'arcade',
      extraCategories: [],
      isFeatured: false,
      supportsScores: true,
    },
  });
  if (!isAdmin(me)) return <Alert tone="error">Only administrators can create games.</Alert>;
  const { errors } = form.formState;
  const submit = form.handleSubmit((values) =>
    create.mutateAsync(values).then(
      (game) => {
        toast.success('Game created.');
        navigate(`/admin/games/${game.id}`);
      },
      (err) => applyServerError(err, form.setError, ['slug', 'title', 'primaryCategory', 'extraCategories']),
    ),
  );
  return (
    <>
      <Back />
      <AdminHeader
        title="New game"
        description="Creates a catalog entry. Playable runtimes ship with the code (packages/game-runtime), so a new entry starts as a draft or coming soon."
      />
      <form onSubmit={submit} noValidate className="glass grid max-w-3xl gap-4 rounded-xl border border-border p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Slug" hint="URL name, e.g. star-forge" error={errors.slug?.message} {...form.register('slug')} />
          <Field label="Engine">
            {({ id }) => (
              <Select id={id} {...form.register('engine')}>
                <option value="DOM">DOM (board, card, puzzle)</option>
                <option value="CANVAS">Canvas (real-time)</option>
              </Select>
            )}
          </Field>
          <Field label="Status">
            {({ id }) => (
              <Select id={id} {...form.register('status')}>
                <option value="DRAFT">Draft (hidden)</option>
                <option value="COMING_SOON">Coming soon (visible)</option>
              </Select>
            )}
          </Field>
        </div>
        <MetadataFields form={form} />
        {errors.root?.server && <Alert tone="error">{errors.root.server.message}</Alert>}
        <div>
          <Button type="submit" loading={create.isPending}>
            Create game
          </Button>
        </div>
      </form>
    </>
  );
}
