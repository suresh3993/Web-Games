import { Link } from 'react-router';
import { cn } from '@/lib/utils';

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn('flex items-center gap-2 rounded-md', className)} aria-label="SURESH home">
      <svg viewBox="0 0 64 64" className="size-8" aria-hidden="true">
        <defs>
          <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7c5cff" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" className="fill-card" />
        <path d="M42 22c0-4-4-6-10-6s-10 3-10 8 4 7 10 8 10 3 10 8-4 8-10 8-10-2-10-6" fill="none" stroke="url(#logo-g)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-display text-lg font-bold tracking-[0.18em]">
        SU<span className="text-gradient">RESH</span>
      </span>
    </Link>
  );
}
