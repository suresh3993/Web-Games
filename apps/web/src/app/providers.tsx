import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { LazyMotion, MotionConfig } from 'framer-motion';
import { useEffect, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { applyTheme, resolveTheme, useThemeStore } from '@/stores/theme-store';

const loadMotionFeatures = () => import('@/lib/motion-features').then((m) => m.default);

function ThemeSync() {
  const theme = useThemeStore((s) => s.theme);
  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);
  return null;
}

/** `queryClient` comes from main.tsx, which starts the session request before the first render. */
export function AppProviders({ children, queryClient }: { children: ReactNode; queryClient: QueryClient }) {
  const theme = useThemeStore((s) => s.theme);
  return (
    <QueryClientProvider client={queryClient}>
      {/* "user" honours the OS reduced-motion setting for every animation. The animation features
          load lazily, so framer-motion stays off the critical path; `strict` forbids the full `motion`. */}
      <MotionConfig reducedMotion="user">
        <LazyMotion features={loadMotionFeatures} strict>
          <ThemeSync />
          {children}
          <Toaster theme={resolveTheme(theme)} position="bottom-right" richColors closeButton />
        </LazyMotion>
      </MotionConfig>
    </QueryClientProvider>
  );
}
