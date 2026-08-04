'use client';

import { ThemeProvider as NextThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

import { THEME_ATTRIBUTE } from '@reliance/ui';

/**
 * Dark mode.
 *
 * The design system keys its explicit overrides on `data-theme`, and treats the absence of
 * the attribute as "follow the OS". next-themes writes the *resolved* value there, so a
 * customer whose machine is dark gets the dark palette on first paint with no flash and no
 * second render — which matters most on the pages that show a rate.
 */
export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  return (
    <NextThemeProvider
      attribute={THEME_ATTRIBUTE}
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemeProvider>
  );
}
