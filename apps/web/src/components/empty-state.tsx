import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  headingLevel = 2,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** 1 when the empty state is the page's main content (e.g. the 404 page). */
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <div className={cn('glass flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-14 text-center', className)}>
      <div className="flex size-14 items-center justify-center rounded-full bg-primary/15 text-primary-text">
        <Icon className="size-7" aria-hidden="true" />
      </div>
      <Heading className="text-lg font-semibold">{title}</Heading>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
