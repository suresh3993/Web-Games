import { Bell, BellRing } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { useUnreadCount } from './api';

/** Header bell with the unread count (polled once a minute). */
export function NotificationBell() {
  const { data } = useUnreadCount(true);
  const unread = data?.unread ?? 0;
  return (
    <Button asChild variant="ghost" size="icon" className="relative">
      <Link to="/notifications" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
        {unread ? <BellRing aria-hidden="true" /> : <Bell aria-hidden="true" />}
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </Link>
    </Button>
  );
}
