import { AnimatePresence, m } from 'framer-motion';
import { Menu, Search, X } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NotificationBell } from '@/features/account/notification-bell';
import { useCurrentUser } from '@/features/auth/api';
import { cn } from '@/lib/utils';
import { Logo } from './logo';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/explore', label: 'Explore' },
  { to: '/categories', label: 'Categories' },
];

function HeaderSearch({ className, onSubmitted }: { className?: string; onSubmitted?: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const id = useId();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    navigate(term ? `/explore?q=${encodeURIComponent(term)}` : '/explore');
    onSubmitted?.();
  };
  return (
    <form role="search" onSubmit={submit} className={cn('relative', className)}>
      <label htmlFor={id} className="sr-only">
        Search games
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input id={id} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search games…" className="h-10 pl-9" maxLength={80} />
    </form>
  );
}

function AuthActions({ stacked = false }: { stacked?: boolean }) {
  const { data: user, isPending } = useCurrentUser();
  if (isPending) return <div className="size-9" aria-hidden="true" />;
  if (user) {
    return (
      <div className="flex items-center gap-1">
        <NotificationBell />
        <UserMenu user={user} />
      </div>
    );
  }
  return (
    <div className={cn('flex gap-2', stacked && 'flex-col')}>
      <Button asChild variant="ghost">
        <Link to="/login">Log in</Link>
      </Button>
      <Button asChild>
        <Link to="/register">Sign up free</Link>
      </Button>
    </div>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Close the mobile menu on navigation and with Escape.
  useEffect(() => setOpen(false), [location.pathname, location.search]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="glass sticky top-0 z-40 border-b border-border">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="ml-4 hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
                )
              }
            >
              {({ isActive }) => (
                <span className="relative">
                  {item.label}
                  {isActive && <span className="absolute -bottom-2 left-0 h-0.5 w-full rounded-full bg-gradient-to-r from-[#7c5cff] to-[#22d3ee]" />}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <HeaderSearch className="ml-auto hidden w-64 lg:block" />
        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <ThemeToggle />
          <div className="hidden md:block">
            <AuthActions />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <m.div
            id="mobile-nav"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-border md:hidden"
          >
            <div className="grid gap-4 px-4 py-4">
              <HeaderSearch onSubmitted={() => setOpen(false)} />
              <nav aria-label="Mobile" className="grid gap-1">
                {NAV.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn('rounded-md px-3 py-3 text-base font-medium hover:bg-muted', isActive ? 'bg-muted text-foreground' : 'text-muted-foreground')
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
              <AuthActions stacked />
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </header>
  );
}
