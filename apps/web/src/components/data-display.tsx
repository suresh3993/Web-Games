import {
  Award,
  Brain,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Compass,
  Crown,
  Flame,
  Gamepad2,
  Gem,
  Heart,
  Map,
  Medal,
  Puzzle,
  Rocket,
  Sparkles,
  Star,
  Swords,
  Target,
  Timer,
  Trophy,
  Zap,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { DayCount, PaginationMeta } from '@suresh/shared-types';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';

/** Explicit map (no dynamic icon imports). Keys match ACHIEVEMENT_ICONS. */
const ACHIEVEMENT_ICONS: Record<string, LucideIcon> = {
  Trophy, Medal, Star, Flame, Crown, Target, Zap, Compass, Gamepad2, Timer, Swords, Puzzle, Brain, Rocket, Award, Sparkles, CalendarCheck, Map, Heart, Gem,
};

export function AchievementIcon({ name, ...props }: { name: string } & LucideProps) {
  const Icon = ACHIEVEMENT_ICONS[name] ?? Trophy;
  return <Icon aria-hidden="true" {...props} />;
}

export function ProgressBar({ value, max, label, className }: { value: number; max: number; label: string; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className={cn('h-2 overflow-hidden rounded-full bg-muted', className)}
    >
      <div className="h-full rounded-full bg-gradient-to-r from-[#7c5cff] to-[#22d3ee] transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Pagination({ meta, onPage }: { meta: PaginationMeta; onPage: (page: number) => void }) {
  if (meta.totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-6 flex items-center justify-center gap-3 text-sm">
      <Button variant="outline" size="sm" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>
        <ChevronLeft aria-hidden="true" /> Previous
      </Button>
      <span className="text-muted-foreground">
        Page {meta.page} of {meta.totalPages}
      </span>
      <Button variant="outline" size="sm" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>
        Next <ChevronRight aria-hidden="true" />
      </Button>
    </nav>
  );
}

export function StatCard({ label, value, hint, icon: Icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="glass rounded-xl border border-border p-4">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        {Icon && <Icon className="size-4" aria-hidden="true" />} {label}
      </p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Dependency-free bar chart for daily counts. Screen readers get a summary label and a
 * data table (visually hidden), so the numbers are never chart-only.
 */
export function DayBarChart({ data, label, height = 140 }: { data: DayCount[]; label: string; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const barWidth = 100 / Math.max(1, data.length);
  return (
    <figure className="grid gap-2">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="h-36 w-full" role="img" aria-label={`${label}: ${total} in ${data.length} days`}>
        {data.map((d, i) => {
          const h = (d.count / max) * (height - 4);
          return (
            <rect key={d.date} x={i * barWidth + barWidth * 0.15} y={height - h} width={barWidth * 0.7} height={Math.max(h, d.count ? 1 : 0)} rx="0.6" className="fill-primary/80">
              <title>{`${d.date}: ${d.count}`}</title>
            </rect>
          );
        })}
      </svg>
      <figcaption className="flex justify-between text-xs text-muted-foreground">
        <span>{data[0]?.date}</span>
        <span>
          {label} · total {total.toLocaleString()} · peak {max === 1 && total === 0 ? 0 : max}
        </span>
        <span>{data.at(-1)?.date}</span>
      </figcaption>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Count</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Horizontal bars for "top N" lists. */
export function RankedBars({ rows, valueLabel }: { rows: { key: string; label: ReactNode; value: number; extra?: ReactNode }[]; valueLabel: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ol className="grid gap-2">
      {rows.map((r) => (
        <li key={r.key} className="grid gap-1 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="shrink-0 font-display tabular-nums" aria-label={`${r.value} ${valueLabel}`}>
              {r.value.toLocaleString()} {r.extra}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className="h-full rounded-full bg-accent" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}
