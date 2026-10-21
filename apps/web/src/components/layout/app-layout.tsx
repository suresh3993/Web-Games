import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router';
import { VerificationBanner } from '@/features/auth/verification-banner';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

export function AppLayout() {
  const location = useLocation();

  // Move focus to the main region after navigation so screen-reader users hear the new page.
  useEffect(() => {
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [location.pathname]);

  return (
    <div className="bg-aurora flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <SiteHeader />
      <VerificationBanner />
      <motion.main
        id="main"
        tabIndex={-1}
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="flex-1 outline-none"
      >
        <Outlet />
      </motion.main>
      <SiteFooter />
      <ScrollRestoration />
    </div>
  );
}
