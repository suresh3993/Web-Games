import { ScrollText } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { Pagination } from '@/components/data-display';
import { EmptyState } from '@/components/empty-state';
import { QueryError } from '@/components/query-error';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/fields';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { AdminHeader, TableShell, tdClass, thClass } from './admin-layout';
import { useAuditLogs } from './api';

const TARGET_TYPES = ['user', 'session', 'game', 'category', 'achievement', 'challenge', 'game_report', 'game_session'];
const ACTION_PRESETS = [
  ['', 'All actions'],
  ['admin.', 'Admin changes'],
  ['auth.', 'Sign-in and account security'],
  ['user.', 'Profile and data'],
  ['score.', 'Flagged scores'],
  ['game.', 'Reports and publishing'],
] as const;

export function AdminAuditLogPage() {
  const [params, setParams] = useSearchParams();
  const q = {
    action: params.get('action') || undefined,
    targetType: params.get('targetType') || undefined,
    targetId: params.get('targetId') || undefined,
    from: params.get('from') || undefined,
    to: params.get('to') || undefined,
    page: Number(params.get('page') ?? 1),
    pageSize: 50,
  };
  const [targetId, setTargetId] = useState(q.targetId ?? '');
  const { data, isPending, isError, error, refetch } = useAuditLogs(q);
  const update = (next: Record<string, string | undefined>) => {
    const merged = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) if (v) merged.set(k, v);
    else merged.delete(k);
    if (!('page' in next)) merged.delete('page');
    setParams(merged, { replace: true });
  };

  return (
    <>
      <AdminHeader title="Audit log" description="Security-relevant events: sign-ins, account changes, staff actions, flagged scores and publishing. Newest first." />
      <div className="mb-4 grid gap-2 md:grid-cols-[auto_auto_1fr_auto_auto]">
        <Select aria-label="Action" value={q.action ?? ''} onChange={(e) => update({ action: e.target.value || undefined })}>
          {ACTION_PRESETS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Select aria-label="Target type" value={q.targetType ?? ''} onChange={(e) => update({ targetType: e.target.value || undefined })}>
          <option value="">Any target</option>
          {TARGET_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <form
          className="flex gap-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            update({ targetId: targetId.trim() || undefined });
          }}
        >
          <Input aria-label="Target ID" placeholder="Target ID…" value={targetId} onChange={(e) => setTargetId(e.target.value)} />
          <Button type="submit" variant="outline">
            Filter
          </Button>
        </form>
        <Input type="date" aria-label="From date" value={q.from ?? ''} onChange={(e) => update({ from: e.target.value || undefined })} />
        <Input type="date" aria-label="To date" value={q.to ?? ''} onChange={(e) => update({ to: e.target.value || undefined })} />
      </div>
      {isError ? (
        <QueryError error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : data.data.length === 0 ? (
        <EmptyState icon={ScrollText} title="No matching events" />
      ) : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">{data.meta.total.toLocaleString()} events</p>
          <TableShell label="Audit log">
            <thead>
              <tr>
                <th scope="col" className={thClass}>When (local time)</th>
                <th scope="col" className={thClass}>Action</th>
                <th scope="col" className={thClass}>Actor</th>
                <th scope="col" className={thClass}>Target</th>
                <th scope="col" className={thClass}>Details</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((e) => (
                <tr key={e.id} className="border-t border-border align-top">
                  <td className={`${tdClass} whitespace-nowrap`}>{new Date(e.createdAt).toLocaleString()}</td>
                  <td className={tdClass}>
                    <code className="text-xs">{e.action}</code>
                  </td>
                  <td className={tdClass}>
                    {e.actor ? (
                      <>
                        <p>{e.actor.displayName}</p>
                        <p className="text-xs text-muted-foreground">{e.actor.email}</p>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {e.ipAddress && <p className="text-xs text-muted-foreground">{e.ipAddress}</p>}
                  </td>
                  <td className={tdClass}>
                    {e.targetType ? (
                      <button type="button" className="text-left text-xs hover:underline" onClick={() => update({ targetType: e.targetType ?? undefined, targetId: e.targetId ?? undefined })}>
                        {e.targetType}
                        <br />
                        <code>{e.targetId}</code>
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={tdClass}>
                    {Object.keys(e.metadata).length ? (
                      <details>
                        <summary className="cursor-pointer text-xs text-primary-text">Show</summary>
                        <pre className="mt-1 max-w-sm overflow-x-auto rounded bg-muted p-2 text-xs">{JSON.stringify(e.metadata, null, 2)}</pre>
                      </details>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
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
