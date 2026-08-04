/**
 * Dark mode.
 *
 * Three modes. `'light'` and `'dark'` are explicit choices: they are persisted and applied through
 * the `data-theme` attribute, which `theme.css` treats as beating the OS preference. `'system'`
 * stores nothing and removes the attribute, letting `prefers-color-scheme` govern. The init
 * script below runs before first paint so a returning user's explicit choice never flashes the
 * wrong theme.
 */

/** The modes a user can pick. `'system'` follows the OS preference. */
export type ThemeMode = 'light' | 'dark' | 'system';

/** A mode with the system preference already resolved — what the user actually sees. */
export type ResolvedTheme = 'light' | 'dark';

/** The localStorage key an explicit choice is persisted under. */
export const THEME_STORAGE_KEY = 'rb-theme';

/** The attribute `theme.css` keys its explicit light/dark overrides on. */
export const THEME_ATTRIBUTE = 'data-theme';

/**
 * Narrows an untrusted persisted value to a {@link ThemeMode}. Anything absent, corrupt or
 * written by an older build means `'system'` — the safest default is the one that cannot be wrong.
 */
export function toThemeMode(value: unknown): ThemeMode {
  if (value === 'light' || value === 'dark' || value === 'system') return value;
  return 'system';
}

/** Resolves a mode against the OS preference. Explicit modes pass straight through. */
export function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): ResolvedTheme {
  if (mode === 'system') return systemPrefersDark ? 'dark' : 'light';
  return mode;
}

/**
 * Applies a mode to the document root. `'system'` removes the attribute so the
 * `prefers-color-scheme` block in `theme.css` governs; an explicit mode sets it.
 */
export function applyTheme(
  mode: ThemeMode,
  root: Pick<HTMLElement, 'setAttribute' | 'removeAttribute'>,
): void {
  if (mode === 'system') {
    root.removeAttribute(THEME_ATTRIBUTE);
    return;
  }
  root.setAttribute(THEME_ATTRIBUTE, mode);
}

/** Reads the persisted choice. Storage can throw in private mode — that also means `'system'`. */
export function readStoredTheme(storage: Pick<Storage, 'getItem'>): ThemeMode {
  try {
    return toThemeMode(storage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

/**
 * Persists a choice. `'system'` is the *absence* of a choice, so it clears the key. A storage
 * failure is swallowed: the theme still applies for the session, it just does not survive it.
 */
export function storeTheme(
  mode: ThemeMode,
  storage: Pick<Storage, 'setItem' | 'removeItem'>,
): void {
  try {
    if (mode === 'system') {
      storage.removeItem(THEME_STORAGE_KEY);
      return;
    }
    storage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Private mode can refuse writes; the session theme is unaffected.
  }
}

/**
 * Blocking no-flash script for the document `<head>`, before any stylesheet-driven paint.
 * Render it inline, e.g. `<script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />`.
 * It only restores *explicit* choices — system mode needs no script because the CSS media query
 * is already correct on first paint.
 */
export const THEME_INIT_SCRIPT =
  `(function(){try{var m=localStorage.getItem('${THEME_STORAGE_KEY}');` +
  `if(m==='light'||m==='dark')document.documentElement.setAttribute('${THEME_ATTRIBUTE}',m);` +
  `}catch(e){}})();`;
