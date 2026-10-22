import { CalendarCheck, FolderTree, Gamepad2, LayoutDashboard, ScrollText, ShieldX, Trophy, Users, Flag, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import type { CurrentUser, Role } from '@playverse/shared-types';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/features/auth/api';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Lowest role that may open it (the API enforces the same rule). */
  role: Role;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, role: 'MODERATOR', end: true },
  { to: '/admin/users', label: 'Users', icon: Users, role: 'MODERATOR' },
  { to: '/admin/reports', label: 'Reports & analytics', icon: Flag, role: 'MODERATOR' },
  { to: '/admin/games', label: 'Games', icon: Gamepad2, role: 'MODERATOR' },
  { to: '/admin/categories', label: 'Categories', icon: FolderTree, role: 'MODERATOR' },
  { to: '/admin/achievements', label: 'Achievements', icon: Trophy, role: 'ADMIN' },
  { to: '/admin/challenges', label: 'Daily challenges', icon: CalendarCheck, role: 'ADMIN' },
  { to: '/admin/audit-log', label: 'Audit log', icon: ScrollText, role: 'ADMIN' },
];

export const isStaff = (user: Pick<CurrentUser, 'role'> | null | undefined) => user?.role === 'ADMIN' || user?.role === 'MODERATOR';
export const isAdmin = (user: Pick<CurrentUser, 'role'> | null | undefined) => user?.role === 'ADMIN';

function Forbidden({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <EmptyState
        icon={ShieldX}
        title="You don’t have access to this page"
        description={message}
        action={
          <Button asChild variant="outline">
            <Link to="/">Back to games</Link>
          </Button>
        }
      />
    </div>
  );
}

/**
 * Staff area shell. Hiding pages here is only a convenience: every admin API call is
 * authorised on the server, so a player who forces the URL gets nothing but this message.
 */
export function AdminLayout() {
  const { data: user, isPending } = useCurrentUser();
  const location = useLocation();
  if (isPending) return <Skeleton className="mx-auto mt-10 h-64 max-w-5xl rounded-xl" />;
  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          icon={ShieldX}
          title="Staff sign-in required"
          description="Log in with a moderator or administrator account."
          action={
            <Button asChild>
              <Link to={`/login?next=${encodeURIComponent(location.pathname)}`}>Log in</Link>
            </Button>
          }
        />
      </div>
    );
  }
  if (!isStaff(user)) return <Forbidden message="The admin area is only for moderators and administrators." />;
  const item = NAV.filter((n) => location.pathname === n.to || location.pathname.startsWith(`${n.to}/`)).sort((a, b) => b.to.length - a.to.length)[0];
  if (item?.role === 'ADMIN' && !isAdmin(user)) return <Forbidden message="This section is for administrators." />;

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="Admin" className="lg:sticky lg:top-24 lg:self-start">
        <p className="mb-2 hidden text-xs font-semibold tracking-wide text-muted-foreground uppercase lg:block">Admin</p>
        <ul className="flex gap-1 overflow-x-auto pb-2 lg:grid lg:overflow-visible lg:pb-0">
          {NAV.filter((n) => n.role === 'MODERATOR' || isAdmin(user)).map((n) => (
            <li key={n.to} className="shrink-0">
              <NavLink
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cn('flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted', isActive ? 'bg-muted text-foreground' : 'text-muted-foreground')
                }
              >
                <n.icon className="size-4" aria-hidden="true" /> {n.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}

export function AdminHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

/** Small helpers shared by admin tables. */
export const thClass = 'px-3 py-2 text-left text-xs font-medium text-muted-foreground';
export const tdClass = 'px-3 py-2 align-middle';

export function TableShell({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="glass overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[640px] text-sm" aria-label={label}>
        {children}
      </table>
    </div>
  );
}
