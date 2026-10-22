import { LogIn, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import type { CurrentUser } from '@suresh/shared-types';
import { useCurrentUser } from '@/features/auth/api';
import { cn } from '@/lib/utils';
import { EmptyState } from './empty-state';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';

export function PageShell({
  icon: Icon,
  title,
  description,
  actions,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mx-auto max-w-7xl px-4 py-10 sm:px-6', className)}>
      <header className="mb-8 flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-3 text-3xl font-bold sm:text-4xl">
            <Icon className="size-8 shrink-0 text-primary-text" aria-hidden="true" /> {title}
          </h1>
          {description && <p className="mt-2 text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

/**
 * Personal pages need an account. The API enforces this; the page explains it and
 * offers to log in, returning here afterwards.
 */
export function RequireAccount({ children }: { children: (user: CurrentUser) => ReactNode }) {
  const { data: user, isPending } = useCurrentUser();
  const location = useLocation();
  if (isPending) return <Skeleton className="h-48 w-full rounded-xl" />;
  if (!user) {
    return (
      <EmptyState
        icon={LogIn}
        title="Log in to see this page"
        description="This page is tied to your account."
        action={
          <Button asChild>
            <Link to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}>Log in</Link>
          </Button>
        }
      />
    );
  }
  return children(user);
}
