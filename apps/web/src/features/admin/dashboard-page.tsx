import { Activity, AlertTriangle, Database, Flag, Gamepad2, HeartPulse, Server, ShieldAlert, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { AdminDashboard } from '@suresh/shared-types';
import { DayBarChart, RankedBars, StatCard } from '@/components/data-display';
import { QueryError } from '@/components/query-error';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { titleCase } from '@/lib/utils';
import { AdminHeader } from './admin-layout';
import { useAdminDashboard } from './api';

const fmt = (n: number) => n.toLocaleString();

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return days ? `${days} d ${hours} h` : hours ? `${hours} h ${minutes} min` : `${minutes} min`;
}

function Health({ health }: { health: AdminDashboard['health'] }) {
  const rows: [string, ReactNode][] = [
    [
      'Database',
      health.database.status === 'ok' ? (
        <Badge variant="success">OK · {health.database.latencyMs} ms</Badge>
      ) : (
        <Badge variant="warning">Unreachable</Badge>
      ),
    ],
    ['Redis', health.redis === 'ok' ? <Badge variant="success">OK</Badge> : health.redis === 'disabled' ? <Badge variant="outline">Not configured</Badge> : <Badge variant="warning">Unreachable (using memory fallback)</Badge>],
    ['API uptime', formatUptime(health.uptimeSeconds)],
    ['Environment', `${health.environment} · Node ${health.nodeVersion}`],
    ['Memory', `${fmt(health.memoryMb)} MB`],
    ['Signed-in sessions', fmt(health.activeSessions)],
    ['Rounds in progress', fmt(health.activeRounds)],
  ];
  return (
    <section aria-labelledby="health" className="glass rounded-xl border border-border p-5">
      <h2 id="health" className="mb-3 flex items-center gap-2 font-semibold">
        <HeartPulse className="size-4" aria-hidden="true" /> Platform health
      </h2>
      <dl className="grid gap-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function AdminDashboardPage() {
  const { data, isPending, isError, error, refetch } = useAdminDashboard();
  if (isError) return <QueryError error={error} onRetry={() => void refetch()} />;
  if (isPending) return <Skeleton className="h-96 rounded-xl" />;
  const t = data.totals;
  return (
    <>
      <AdminHeader title="Dashboard" description="Last 30 days unless noted. Refreshes every minute." />
      <div className="grid gap-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon={Users} label="Registered users" value={fmt(t.users)} hint={`${fmt(t.verifiedUsers)} verified · ${fmt(t.newUsers7d)} new this week`} />
          <StatCard icon={Activity} label="Active users (7 days)" value={fmt(t.activeUsers7d)} hint={`${fmt(t.activeUsers1d)} today · ${fmt(t.activeUsers30d)} in 30 days`} />
          <StatCard icon={Gamepad2} label="Game launches (7 days)" value={fmt(t.launches7d)} hint={`${fmt(t.launches1d)} today · ${fmt(t.launches30d)} in 30 days`} />
          <StatCard
            icon={Flag}
            label="Open reports"
            value={<Link to="/admin/reports" className="hover:underline">{fmt(t.openReports)}</Link>}
            hint={`${fmt(t.flaggedScores7d)} flagged scores this week`}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <section aria-labelledby="launches" className="glass rounded-xl border border-border p-5">
            <h2 id="launches" className="mb-3 font-semibold">
              Game launches per day
            </h2>
            <DayBarChart data={data.launchesByDay} label="Launches" />
          </section>
          <Health health={data.health} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section aria-labelledby="top-games" className="glass rounded-xl border border-border p-5">
            <h2 id="top-games" className="mb-3 font-semibold">
              Most played games
            </h2>
            {data.topGames.length ? (
              <RankedBars
                valueLabel="launches"
                rows={data.topGames.map((g) => ({
                  key: g.slug,
                  label: <Link to={`/games/${g.slug}`} className="hover:underline">{g.title}</Link>,
                  value: g.launches,
                  extra: <span className="text-xs text-muted-foreground">({fmt(g.players)} players)</span>,
                }))}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No launches yet.</p>
            )}
          </section>
          <section aria-labelledby="categories" className="glass rounded-xl border border-border p-5">
            <h2 id="categories" className="mb-3 font-semibold">
              Category performance
            </h2>
            <RankedBars
              valueLabel="launches"
              rows={data.categories.map((c) => ({
                key: c.slug,
                label: `${c.name} (${c.games} live)`,
                value: c.launches,
                extra: <span className="text-xs text-muted-foreground">({fmt(c.players)} players)</span>,
              }))}
            />
          </section>
        </div>

        <section aria-labelledby="catalog" className="glass rounded-xl border border-border p-5">
          <h2 id="catalog" className="mb-3 flex items-center gap-2 font-semibold">
            <Database className="size-4" aria-hidden="true" /> Catalog
          </h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(t.gamesByStatus).map(([status, count]) => (
              <Link key={status} to={`/admin/games?status=${status}`}>
                <Badge variant={status === 'PUBLISHED' ? 'success' : status === 'COMING_SOON' ? 'primary' : 'outline'} className="text-sm">
                  {titleCase(status.replace('_', ' '))}: {fmt(count)}
                </Badge>
              </Link>
            ))}
          </div>
          {t.gamesByStatus.COMING_SOON > 0 && (
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="size-3.5" aria-hidden="true" /> Coming-soon games go live after their launch was tested in preview (see Games).
            </p>
          )}
        </section>

        <section aria-labelledby="signups" className="glass rounded-xl border border-border p-5">
          <h2 id="signups" className="mb-3 flex items-center gap-2 font-semibold">
            <Server className="size-4" aria-hidden="true" /> New registrations per day
          </h2>
          <DayBarChart data={data.signupsByDay} label="Registrations" />
        </section>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldAlert className="size-3.5" aria-hidden="true" /> Staff actions are recorded in the audit log.
        </p>
      </div>
    </>
  );
}
