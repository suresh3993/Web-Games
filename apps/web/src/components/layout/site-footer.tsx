import { Link } from 'react-router';
import { useCurrentUser } from '@/features/auth/api';
import { Logo } from './logo';

const GUEST_LINKS = [
  { to: '/register', label: 'Create account' },
  { to: '/login', label: 'Log in' },
  { to: '/forgot-password', label: 'Reset password' },
];

const PLAYER_LINKS = [
  { to: '/profile', label: 'Your profile' },
  { to: '/achievements', label: 'Achievements' },
  { to: '/settings', label: 'Settings' },
];

export function SiteFooter() {
  const { data: user } = useCurrentUser();
  return (
    <footer className="mt-24 border-t border-border">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="grid gap-3">
          <Logo />
          <p className="max-w-sm text-sm text-muted-foreground">
            Original browser games built in-house. No downloads, no installs, no pay-to-win.
          </p>
        </div>
        <nav aria-label="Discover" className="grid content-start gap-2 text-sm">
          <p className="font-semibold">Discover</p>
          <Link to="/explore" className="text-muted-foreground hover:text-foreground">
            All games
          </Link>
          <Link to="/categories" className="text-muted-foreground hover:text-foreground">
            Categories
          </Link>
          <Link to="/explore?sort=newest" className="text-muted-foreground hover:text-foreground">
            New additions
          </Link>
        </nav>
        <nav aria-label="Account" className="grid content-start gap-2 text-sm">
          <p className="font-semibold">Account</p>
          {(user ? PLAYER_LINKS : GUEST_LINKS).map((link) => (
            <Link key={link.to} to={link.to} className="text-muted-foreground hover:text-foreground">
              {link.label}
            </Link>
          ))}
        </nav>
        <nav aria-label="Support" className="grid content-start gap-2 text-sm">
          <p className="font-semibold">Support</p>
          <Link to="/help" className="text-muted-foreground hover:text-foreground">
            Help and support
          </Link>
          <Link to="/privacy" className="text-muted-foreground hover:text-foreground">
            Privacy policy
          </Link>
          <Link to="/terms" className="text-muted-foreground hover:text-foreground">
            Terms of service
          </Link>
        </nav>
      </div>
      <div className="border-t border-border py-5 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} SURESH. All games and artwork are original works.
      </div>
    </footer>
  );
}
