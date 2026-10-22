import { Search, ShieldCheck, UserCog } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ROLES, type AdminUserRow, type Role } from '@suresh/shared-types';
import { Pagination } from '@/components/data-display';
import { Avatar } from '@/components/layout/user-menu';
import { QueryError } from '@/components/query-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Field, Select, Textarea } from '@/components/ui/fields';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/features/auth/api';
import { isApiError } from '@/lib/api';
import { formatRelative, titleCase } from '@/lib/utils';
import { AdminHeader, isAdmin, TableShell, tdClass, thClass } from './admin-layout';
import { useAdminUser, useAdminUsers, useSetUserRole, useSetUserStatus } from './api';

const ROLE_LABEL: Record<Role, string> = { USER: 'Player', MODERATOR: 'Moderator', ADMIN: 'Admin' };

function ManageUser({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: me } = useCurrentUser();
  const { data: user, isPending, isError, error } = useAdminUser(id);
  const setStatus = useSetUserStatus();
  const setRole = useSetUserRole();
  const [reason, setReason] = useState('');
  const [role, setRoleChoice] = useState<Role | ''>('');
  const [confirm, setConfirm] = useState<'status' | 'role' | null>(null);
  const self = me?.id === id;
  const canModerate = user && !self && (isAdmin(me) || user.role === 'USER');
  const suspending = user?.status === 'ACTIVE';

  const fail = (err: unknown) => toast.error(isApiError(err) ? err.message : 'That did not work.');

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>Manage user</DialogTitle>
        {isError ? (
          <DialogDescription>{isApiError(error) ? error.message : 'Could not load this user.'}</DialogDescription>
        ) : isPending ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="grid gap-5">
            <DialogDescription asChild>
              <div className="flex items-center gap-3">
                <Avatar user={user} size="lg" />
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-foreground">{user.displayName}</p>
                  <p className="truncate">{user.email}</p>
                  <p className="text-xs">
                    {ROLE_LABEL[user.role]} · {titleCase(user.status)} · level {user.level} · joined {new Date(user.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </DialogDescription>
            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
              {Object.entries({ Rounds: user.stats.rounds, 'Flagged scores': user.stats.flaggedScores, 'Reports filed': user.stats.reportsFiled, Favourites: user.stats.favorites, 'Active sessions': user.stats.activeSessions }).map(([k, v]) => (
                <div key={k} className="rounded-lg bg-muted/60 p-2">
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="font-display font-bold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>

            {canModerate ? (
              <form
                className="grid gap-3"
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  setConfirm('status');
                }}
              >
                <Field label={suspending ? 'Reason for suspension' : 'Reason for reactivation'} hint="Recorded in the audit log and, for suspensions, emailed to the user.">
                  {({ id: fieldId, describedBy }) => (
                    <Textarea id={fieldId} aria-describedby={describedBy} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} required minLength={5} />
                  )}
                </Field>
                <div>
                  <Button type="submit" variant={suspending ? 'destructive' : 'primary'} disabled={reason.trim().length < 5} loading={setStatus.isPending}>
                    {suspending ? 'Suspend account' : 'Reactivate account'}
                  </Button>
                </div>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                {self ? 'You can’t change your own account here.' : 'Only administrators can moderate staff accounts.'}
              </p>
            )}

            {isAdmin(me) && !self && (
              <div className="grid gap-2">
                <Field label="Role" hint="Moderators can review reports and suspend players. Admins can do everything, including changing roles.">
                  {({ id: fieldId, describedBy }) => (
                    <div className="flex gap-2">
                      <Select id={fieldId} aria-describedby={describedBy} value={role || user.role} onChange={(e) => setRoleChoice(e.target.value as Role)}>
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </Select>
                      <Button variant="outline" disabled={!role || role === user.role} onClick={() => setConfirm('role')} loading={setRole.isPending}>
                        <ShieldCheck aria-hidden="true" /> Change role
                      </Button>
                    </div>
                  )}
                </Field>
              </div>
            )}

            {user.recentActivity.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">Recent activity</h3>
                <ul className="grid max-h-48 gap-1 overflow-y-auto text-xs text-muted-foreground">
                  {user.recentActivity.map((a) => (
                    <li key={a.id} className="flex justify-between gap-3">
                      <code>{a.action}</code>
                      <span>{formatRelative(a.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <ConfirmDialog
          open={confirm === 'status'}
          title={suspending ? 'Suspend this account?' : 'Reactivate this account?'}
          description={suspending ? 'They will be signed out everywhere immediately and receive an email with your reason.' : 'They will be able to sign in again.'}
          confirmLabel={suspending ? 'Suspend' : 'Reactivate'}
          destructive={suspending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            setStatus.mutate(
              { id, status: suspending ? 'SUSPENDED' : 'ACTIVE', reason: reason.trim() },
              {
                onSuccess: () => {
                  toast.success(suspending ? 'Account suspended.' : 'Account reactivated.');
                  setReason('');
                },
                onError: fail,
              },
            );
          }}
        />
        <ConfirmDialog
          open={confirm === 'role'}
          title="Change this user’s role?"
          description={role ? `They will become: ${ROLE_LABEL[role as Role]}. The change applies to their next request.` : ''}
          confirmLabel="Change role"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            if (role) setRole.mutate({ id, role }, { onSuccess: () => toast.success('Role updated.'), onError: fail });
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function statusBadge(u: AdminUserRow) {
  return u.status === 'ACTIVE' ? <Badge variant="success">Active</Badge> : <Badge variant="warning">Suspended</Badge>;
}

export function AdminUsersPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [managing, setManaging] = useState<string | null>(null);
  const q = {
    q: params.get('q') || undefined,
    role: params.get('role') || undefined,
    status: params.get('status') || undefined,
    sort: params.get('sort') || 'newest',
    page: Number(params.get('page') ?? 1),
  };
  const { data, isPending, isError, error, refetch } = useAdminUsers(q);
  const update = (next: Record<string, string | undefined>) => {
    const merged = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) if (v) merged.set(k, v);
    else merged.delete(k);
    if (!('page' in next)) merged.delete('page');
    setParams(merged, { replace: true });
  };

  return (
    <>
      <AdminHeader title="Users" description="Search accounts, review activity, suspend players and manage staff roles." />
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: search.trim() || undefined });
          }}
          className="relative"
        >
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input aria-label="Search users by email, name or ID" placeholder="Email, name or user ID…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>
        <Select aria-label="Role" value={q.role ?? ''} onChange={(e) => update({ role: e.target.value || undefined })}>
          <option value="">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </Select>
        <Select aria-label="Status" value={q.status ?? ''} onChange={(e) => update({ status: e.target.value || undefined })}>
          <option value="">Any status</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
        </Select>
        <Select aria-label="Sort" value={q.sort} onChange={(e) => update({ sort: e.target.value })}>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="name">Name</option>
          <option value="xp">Most XP</option>
          <option value="lastLogin">Last sign-in</option>
        </Select>
      </div>
      {isError ? (
        <QueryError error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">{data.meta.total.toLocaleString()} users</p>
          <TableShell label="Users">
            <thead>
              <tr>
                <th scope="col" className={thClass}>User</th>
                <th scope="col" className={thClass}>Role</th>
                <th scope="col" className={thClass}>Status</th>
                <th scope="col" className={thClass}>Level</th>
                <th scope="col" className={thClass}>Joined</th>
                <th scope="col" className={thClass}>Last sign-in</th>
                <th scope="col" className={thClass}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className={tdClass}>
                    <div className="flex items-center gap-2">
                      <Avatar user={u} />
                      <div className="min-w-0">
                        <p className="font-medium">{u.displayName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {u.email} {!u.emailVerified && '· unverified'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className={tdClass}>{u.role === 'USER' ? ROLE_LABEL.USER : <Badge variant="accent">{ROLE_LABEL[u.role]}</Badge>}</td>
                  <td className={tdClass}>{statusBadge(u)}</td>
                  <td className={tdClass}>{u.level}</td>
                  <td className={tdClass}>{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className={tdClass}>{u.lastLoginAt ? formatRelative(u.lastLoginAt) : '—'}</td>
                  <td className={`${tdClass} text-right`}>
                    <Button size="sm" variant="outline" onClick={() => setManaging(u.id)}>
                      <UserCog aria-hidden="true" /> Manage
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
          <Pagination meta={data.meta} onPage={(page) => update({ page: String(page) })} />
        </>
      )}
      {managing && <ManageUser id={managing} onClose={() => setManaging(null)} />}
    </>
  );
}
