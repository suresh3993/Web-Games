import { BarChart3, Flag, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { REPORT_STATUSES, type AdminReport, type ReportStatus } from '@suresh/shared-types';
import { DayBarChart, Pagination, RankedBars } from '@/components/data-display';
import { EmptyState } from '@/components/empty-state';
import { QueryError } from '@/components/query-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Field, Select, Textarea } from '@/components/ui/fields';
import { Skeleton } from '@/components/ui/skeleton';
import { isApiError } from '@/lib/api';
import { formatRelative, titleCase } from '@/lib/utils';
import { AdminHeader } from './admin-layout';
import { useAdminDashboard, useAdminReports, useUpdateReport } from './api';

const STATUS_VARIANT: Record<ReportStatus, 'warning' | 'primary' | 'success' | 'outline'> = { OPEN: 'warning', IN_REVIEW: 'primary', RESOLVED: 'success', DISMISSED: 'outline' };
const label = (s: string) => titleCase(s.replace('_', ' '));

function ReviewDialog({ report, onClose }: { report: AdminReport; onClose: () => void }) {
  const update = useUpdateReport();
  const [status, setStatus] = useState<'IN_REVIEW' | 'RESOLVED' | 'DISMISSED'>(report.status === 'OPEN' ? 'IN_REVIEW' : 'RESOLVED');
  const [note, setNote] = useState(report.resolutionNote ?? '');
  const save = () =>
    update.mutate(
      { id: report.id, status, resolutionNote: note.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Report updated.');
          onClose();
        },
        onError: (err) => toast.error(isApiError(err) ? err.message : 'Update failed.'),
      },
    );
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogTitle>Review report</DialogTitle>
        <DialogDescription>
          {label(report.reason)} report about <Link to={`/games/${report.game.slug}`} className="underline">{report.game.title}</Link> from{' '}
          {report.reporter?.displayName ?? 'a deleted account'}, {formatRelative(report.createdAt)}.
        </DialogDescription>
        <blockquote className="rounded-lg bg-muted/60 p-3 text-sm whitespace-pre-wrap">{report.details}</blockquote>
        <Field label="New status">
          {({ id }) => (
            <Select id={id} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="IN_REVIEW">In review</option>
              <option value="RESOLVED">Resolved</option>
              <option value="DISMISSED">Dismissed</option>
            </Select>
          )}
        </Field>
        <Field label="Note to the reporter (optional)" hint="Sent with the notification when you resolve or dismiss the report.">
          {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={update.isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Analytics() {
  const { data, isPending, isError, error, refetch } = useAdminDashboard();
  if (isError) return <QueryError error={error} onRetry={() => void refetch()} />;
  if (isPending) return <Skeleton className="h-72 rounded-xl" />;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section aria-labelledby="a-launches" className="glass rounded-xl border border-border p-5">
        <h3 id="a-launches" className="mb-3 font-semibold">
          Launches per day (30 days)
        </h3>
        <DayBarChart data={data.launchesByDay} label="Launches" />
      </section>
      <section aria-labelledby="a-signups" className="glass rounded-xl border border-border p-5">
        <h3 id="a-signups" className="mb-3 font-semibold">
          Registrations per day (30 days)
        </h3>
        <DayBarChart data={data.signupsByDay} label="Registrations" />
      </section>
      <section aria-labelledby="a-top" className="glass rounded-xl border border-border p-5">
        <h3 id="a-top" className="mb-3 font-semibold">
          Top games by launches
        </h3>
        {data.topGames.length ? (
          <RankedBars valueLabel="launches" rows={data.topGames.map((g) => ({ key: g.slug, label: g.title, value: g.launches, extra: <span className="text-xs text-muted-foreground">({g.players} players)</span> }))} />
        ) : (
          <p className="text-sm text-muted-foreground">No launches yet.</p>
        )}
      </section>
      <section aria-labelledby="a-cats" className="glass rounded-xl border border-border p-5">
        <h3 id="a-cats" className="mb-3 font-semibold">
          Players by category
        </h3>
        <RankedBars valueLabel="players" rows={data.categories.map((c) => ({ key: c.slug, label: c.name, value: c.players }))} />
      </section>
    </div>
  );
}

export function AdminReportsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || undefined;
  const page = Number(params.get('page') ?? 1);
  const { data, isPending, isError, error, refetch } = useAdminReports({ status, page });
  const [reviewing, setReviewing] = useState<AdminReport | null>(null);
  return (
    <>
      <AdminHeader title="Reports & analytics" description="Player reports about games, newest open ones first, and how the platform is used." />
      <section aria-labelledby="reports" className="mb-10 grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="reports" className="mr-auto flex items-center gap-2 text-lg font-semibold">
            <Flag className="size-5" aria-hidden="true" /> Reports
          </h2>
          <Select
            aria-label="Filter by status"
            className="w-auto"
            value={status ?? ''}
            onChange={(e) => setParams(e.target.value ? { status: e.target.value } : {}, { replace: true })}
          >
            <option value="">All</option>
            {REPORT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </Select>
        </div>
        {isError ? (
          <QueryError error={error} onRetry={() => void refetch()} />
        ) : isPending ? (
          <Skeleton className="h-48 rounded-xl" />
        ) : data.data.length === 0 ? (
          <EmptyState icon={MessageSquare} title="No reports" description={status ? 'Nothing with this status.' : 'Players haven’t reported anything yet.'} />
        ) : (
          <>
            <ul className="glass divide-y divide-border overflow-hidden rounded-xl border border-border">
              {data.data.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant={STATUS_VARIANT[r.status]}>{label(r.status)}</Badge>
                      <span className="font-medium">{label(r.reason)}</span> ·
                      <Link to={`/games/${r.game.slug}`} className="hover:underline">
                        {r.game.title}
                      </Link>
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.details}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {r.reporter?.displayName ?? 'Deleted account'} · {formatRelative(r.createdAt)}
                      {r.resolvedBy && <> · handled by {r.resolvedBy.displayName}</>}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setReviewing(r)}>
                    Review
                  </Button>
                </li>
              ))}
            </ul>
            <Pagination meta={data.meta} onPage={(p) => setParams({ ...(status ? { status } : {}), page: String(p) }, { replace: true })} />
          </>
        )}
      </section>

      <section aria-labelledby="analytics" className="grid gap-3">
        <h2 id="analytics" className="flex items-center gap-2 text-lg font-semibold">
          <BarChart3 className="size-5" aria-hidden="true" /> Analytics
        </h2>
        <Analytics />
      </section>
      {reviewing && <ReviewDialog report={reviewing} onClose={() => setReviewing(null)} />}
    </>
  );
}
