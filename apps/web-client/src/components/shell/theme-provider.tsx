'use client';

/**
 * Light, dark, or whatever the device says.
 *
 * Built on `@reliance/ui`'s theme helpers rather than a general-purpose theming library, so there
 * is exactly one storage key and one attribute in play. Two mechanisms writing `data-theme` is how
 * an app ends up flashing the wrong theme on every third load.
 *
 * Both inputs — the stored choice and the device preference — are read through
 * `useSyncExternalStore`. They are genuinely external stores, and reading them that way means the
 * server renders the neutral default and the browser renders the truth in the same pass, with no
 * cascading state update in between.
 *
 * The blocking script runs before the first paint. `'system'` needs no script — the media query in
 * the design system's stylesheet is already correct — so it only restores an explicit choice.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import {
  applyTheme,
  resolveTheme,
  THEME_INIT_SCRIPT,
  type ResolvedTheme,
  type ThemeMode,
} from '@reliance/ui';

import {
  readPrefersDark,
  serverPrefersDark,
  subscribeToColorScheme,
  themeModeStore,
} from '@/lib/theme-store';

/** The theme, and the ability to change it. */
export interface ThemeApi {
  /** What the customer chose. `'system'` means they have not chosen. */
  readonly mode: ThemeMode;
  /** What they are actually looking at. */
  readonly resolved: ResolvedTheme;
  readonly setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeApi | null>(null);

/**
 * The current theme.
 *
 * @throws when called outside {@link ThemeProvider}.
 */
export function useTheme(): ThemeApi {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be called inside <ThemeProvider>.');
  return context;
}

/** Mount once, at the top of the tree. */
export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  const mode = useSyncExternalStore(
    themeModeStore.subscribe,
    themeModeStore.read,
    themeModeStore.readServer,
  );
  const prefersDark = useSyncExternalStore(
    subscribeToColorScheme,
    readPrefersDark,
    serverPrefersDark,
  );

  const setMode = useCallback((next: ThemeMode) => {
    themeModeStore.write(next);
    applyTheme(next, document.documentElement);
  }, []);

  const value = useMemo<ThemeApi>(
    () => ({ mode, resolved: resolveTheme(mode, prefersDark), setMode }),
    [mode, prefersDark, setMode],
  );

  return (
    <ThemeContext.Provider value={value}>
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      {children}
    </ThemeContext.Provider>
  );
}
