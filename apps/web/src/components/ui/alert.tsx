import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const STYLES = {
  info: { icon: Info, className: 'border-accent/30 bg-accent/10' },
  success: { icon: CheckCircle2, className: 'border-success/30 bg-success/10' },
  error: { icon: AlertTriangle, className: 'border-destructive/40 bg-destructive/10' },
} as const;

export function Alert({ tone = 'info', title, children, className }: { tone?: keyof typeof STYLES; title?: string; children?: ReactNode; className?: string }) {
  const { icon: Icon, className: toneClass } = STYLES[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-lg border p-4 text-sm', toneClass, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="grid gap-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-muted-foreground">{children}</div>}
      </div>
    </div>
  );
}
