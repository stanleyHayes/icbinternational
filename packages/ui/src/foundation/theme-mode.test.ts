/**
 * Dark mode has two failure modes worth pinning: an explicit choice must survive a reload without
 * a flash of the wrong theme, and a corrupt stored value must fall back to the OS rather than to
 * a broken attribute. Everything here is pure or against a fake — the DOM work is two lines.
 */

import {
  applyTheme,
  readStoredTheme,
  resolveTheme,
  storeTheme,
  THEME_ATTRIBUTE,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  toThemeMode,
} from './theme-mode.js';

/** A Map-backed `localStorage` double; optionally hostile, like private mode. */
function fakeStorage(initial: Record<string, string> = {}, hostile = false) {
  const map = new Map(Object.entries(initial));

  return {
    getItem: (key: string) => {
      if (hostile) throw new DOMException('denied');
      return map.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (hostile) throw new DOMException('denied');
      map.set(key, value);
    },
    removeItem: (key: string) => {
      if (hostile) throw new DOMException('denied');
      map.delete(key);
    },
    has: (key: string) => map.has(key),
    value: (key: string) => map.get(key),
  };
}

describe('toThemeMode', () => {
  it('passes valid modes through', () => {
    expect(toThemeMode('light')).toBe('light');
    expect(toThemeMode('dark')).toBe('dark');
    expect(toThemeMode('system')).toBe('system');
  });

  it('falls back to system for anything else', () => {
    for (const junk of [null, undefined, 42, 'sepia', '', {}]) {
      expect(toThemeMode(junk)).toBe('system');
    }
  });
});

describe('resolveTheme', () => {
  it('passes explicit modes straight through', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('resolves system against the OS preference', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('applyTheme', () => {
  afterEach(() => {
    document.documentElement.removeAttribute(THEME_ATTRIBUTE);
  });

  it('sets the attribute for an explicit mode', () => {
    applyTheme('dark', document.documentElement);
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('dark');
  });

  it('removes the attribute for system, letting the media query govern', () => {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, 'light');

    applyTheme('system', document.documentElement);

    expect(document.documentElement.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
  });
});

describe('stored theme', () => {
  it('reads back a persisted explicit choice', () => {
    const storage = fakeStorage();
    storeTheme('dark', storage);

    expect(readStoredTheme(storage)).toBe('dark');
    expect(storage.value(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('stores system as the absence of a choice', () => {
    const storage = fakeStorage({ [THEME_STORAGE_KEY]: 'light' });
    storeTheme('system', storage);

    expect(storage.has(THEME_STORAGE_KEY)).toBe(false);
    expect(readStoredTheme(storage)).toBe('system');
  });

  it('treats a corrupt stored value as system', () => {
    expect(readStoredTheme(fakeStorage({ [THEME_STORAGE_KEY]: 'sepia' }))).toBe('system');
  });

  it('survives hostile storage on both read and write', () => {
    const storage = fakeStorage({}, true);

    expect(readStoredTheme(storage)).toBe('system');
    expect(() => storeTheme('dark', storage)).not.toThrow();
  });
});

describe('THEME_INIT_SCRIPT', () => {
  it('restores the persisted choice from the same key and attribute the helpers use', () => {
    expect(THEME_INIT_SCRIPT).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')`);
    expect(THEME_INIT_SCRIPT).toContain(`setAttribute('${THEME_ATTRIBUTE}'`);
  });

  it('only restores explicit choices — system mode is already correct via the media query', () => {
    expect(THEME_INIT_SCRIPT).toContain("m==='light'||m==='dark'");
    expect(THEME_INIT_SCRIPT).not.toContain('matchMedia');
  });

  it('fails closed when storage is unavailable', () => {
    expect(THEME_INIT_SCRIPT).toContain('catch');
  });
});
