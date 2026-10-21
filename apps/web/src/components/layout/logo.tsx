import { Link } from 'react-router';
import { cn } from '@/lib/utils';

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn('flex items-center gap-2 rounded-md', className)} aria-label="PLAYVERSE home">
      <svg viewBox="0 0 64 64" className="size-8" aria-hidden="true">
        <defs>
          <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7c5cff" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" className="fill-card" />
        <path d="M22 16h14a12 12 0 0 1 0 24h-6v8h-8z" fill="none" stroke="url(#logo-g)" strokeWidth="6" strokeLinejoin="round" />
        <circle cx="34" cy="28" r="3.5" fill="#22d3ee" />
      </svg>
      <span className="font-display text-lg font-bold tracking-[0.18em]">
        PLAY<span className="text-gradient">VERSE</span>
      </span>
    </Link>
  );
}
