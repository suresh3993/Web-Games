import { Bell, CalendarCheck, CheckCheck, Gavel, Info, Sparkles, Trophy } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { NotificationItem, NotificationType } from '@suresh/shared-types';
import { Pagination } from '@/components/data-display';
import { EmptyState } from '@/components/empty-state';
import { PageShell, RequireAccount } from '@/components/page-shell';
import { QueryError } from '@/components/query-error';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatRelative } from '@/lib/utils';
import { useMarkAllRead, useMarkRead, useNotifications } from './api';

const TYPE_ICONS: Record<NotificationType, typeof Bell> = {
  SYSTEM: Info,
  ACHIEVEMENT: Trophy,
  CHALLENGE: CalendarCheck,
  LEVEL_UP: Sparkles,
  MODERATION: Gavel,
};

function NotificationRow({ item }: { item: NotificationItem }) {
  const markRead = useMarkRead();
  const navigate = useNavigate();
  const Icon = TYPE_ICONS[item.type];
  const unread = !item.readAt;
  const open = () => {
    if (unread) markRead.mutate(item.id);
    if (item.link) navigate(item.link);
  };
  return (
    <li className={cn('flex items-start gap-3 px-4 py-3', unread && 'bg-primary/10')}>
      <span className={cn('mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full', unread ? 'bg-primary/20 text-primary-text' : 'bg-muted text-muted-foreground')}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm', unread && 'font-semibold')}>
          {unread && <span className="sr-only">Unread: </span>}
          {item.title}
        </p>
        <p className="text-sm text-muted-foreground">{item.body}</p>
        <p className="mt-1 text-xs text-muted-foreground">{formatRelative(item.createdAt)}</p>
      </div>
      <div className="flex shrink-0 gap-1">
        {item.link && (
          <Button size="sm" variant="outline" onClick={open}>
            View
          </Button>
        )}
        {unread && !item.link && (
          <Button size="sm" variant="ghost" onClick={() => markRead.mutate(item.id)} loading={markRead.isPending}>
            Mark read
          </Button>
        )}
      </div>
    </li>
  );
}

function NotificationList() {
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data, isPending, isError, error, refetch } = useNotifications(page, unreadOnly);
  const markAll = useMarkAllRead();
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Filter notifications" className="flex gap-1">
          {[false, true].map((u) => (
            <Button
              key={String(u)}
              size="sm"
              variant={unreadOnly === u ? 'primary' : 'ghost'}
              aria-pressed={unreadOnly === u}
              onClick={() => {
                setUnreadOnly(u);
                setPage(1);
              }}
            >
              {u ? 'Unread' : 'All'}
            </Button>
          ))}
        </div>
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => markAll.mutate()} loading={markAll.isPending}>
          <CheckCheck aria-hidden="true" /> Mark all as read
        </Button>
      </div>
      {isError ? (
        <QueryError error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : data.data.length === 0 ? (
        <EmptyState icon={Bell} title={unreadOnly ? 'You’re all caught up' : 'No notifications yet'} description="Achievements, challenges, level-ups and replies to your reports show up here." />
      ) : (
        <>
          <ul className="glass divide-y divide-border overflow-hidden rounded-xl border border-border">
            {data.data.map((n) => (
              <NotificationRow key={n.id} item={n} />
            ))}
          </ul>
          <Pagination meta={data.meta} onPage={setPage} />
        </>
      )}
    </div>
  );
}

export function NotificationsPage() {
  return (
    <PageShell icon={Bell} title="Notifications" description="Achievements, challenges, level-ups and moderation updates.">
      <RequireAccount>{() => <NotificationList />}</RequireAccount>
    </PageShell>
  );
}
