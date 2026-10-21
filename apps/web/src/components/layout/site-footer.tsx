import { Link } from 'react-router';
import { Logo } from './logo';

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[2fr_1fr_1fr]">
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
          <Link to="/register" className="text-muted-foreground hover:text-foreground">
            Create account
          </Link>
          <Link to="/login" className="text-muted-foreground hover:text-foreground">
            Log in
          </Link>
          <Link to="/forgot-password" className="text-muted-foreground hover:text-foreground">
            Reset password
          </Link>
        </nav>
      </div>
      <div className="border-t border-border py-5 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} PLAYVERSE. All games and artwork are original works.
      </div>
    </footer>
  );
}
