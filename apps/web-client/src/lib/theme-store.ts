'use client';

/**
 * The stores behind the theme: the customer's choice, and the device's preference.
 *
 * Both are external to React — one lives in `localStorage`, the other in a media query — so both
 * are exposed as subscribable stores rather than being copied into state by an effect.
 */

import { THEME_STORAGE_KEY, toThemeMode, type ThemeMode } from '@reliance/ui';

import { persistentValue } from './persistent-value';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * The customer's explicit choice.
 *
 * `'system'` is the *absence* of a choice, so it clears the key — which is exactly what the design
 * system's own `readStoredTheme` expects to find.
 */
export const themeModeStore = persistentValue<ThemeMode>({
  key: THEME_STORAGE_KEY,
  fallback: 'system',
  parse: toThemeMode,
  serialise: (mode) => (mode === 'system' ? null : mode),
});

/** Subscribes to the operating system's light/dark preference. */
export function subscribeToColorScheme(onChange: () => void): () => void {
  const query = globalThis.matchMedia?.(DARK_QUERY);
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
}

/** Whether the device is currently asking for a dark interface. */
export function readPrefersDark(): boolean {
  return globalThis.matchMedia?.(DARK_QUERY).matches ?? false;
}

/** What a server render must assume: light, matching the stylesheet's own default. */
export function serverPrefersDark(): boolean {
  return false;
}
