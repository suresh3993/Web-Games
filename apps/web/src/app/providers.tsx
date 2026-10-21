import { QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { createQueryClient } from '@/lib/query-client';
import { applyTheme, resolveTheme, useThemeStore } from '@/stores/theme-store';

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

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  const theme = useThemeStore((s) => s.theme);
  return (
    <QueryClientProvider client={queryClient}>
      {/* "user" honours the OS reduced-motion setting for every Framer Motion animation. */}
      <MotionConfig reducedMotion="user">
        <ThemeSync />
        {children}
        <Toaster theme={resolveTheme(theme)} position="bottom-right" richColors closeButton />
      </MotionConfig>
    </QueryClientProvider>
  );
}
