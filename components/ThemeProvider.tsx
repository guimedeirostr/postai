'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

export const DARK_ROUTES = [
  /^\/canvas\/(?!$)/,
  /^\/posts\/[^/]+\/compiler/,
  /^\/posts\/[^/]+\/review/,
];

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDark = DARK_ROUTES.some(rx => rx.test(pathname));

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  return <>{children}</>;
}
