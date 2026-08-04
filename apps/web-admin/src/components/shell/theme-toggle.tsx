/**
 * Light, dark, or whatever the operating system says.
 *
 * A back office is used at 06:00 in a dark room and at 14:00 by a window, so the choice
 * is explicit rather than inferred once. The three states are separate buttons rather
 * than one cycling button: an operator should be able to see which mode is active
 * without clicking to find out.
 */

'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useState, type ComponentType } from 'react';

import {
  applyTheme,
  cn,
  FOCUS_RING,
  readStoredTheme,
  storeTheme,
  TRANSITION_STATE,
  type ThemeMode,
} from '@reliance/ui';

interface ModeOption {
  readonly mode: ThemeMode;
  readonly label: string;
  readonly Icon: ComponentType<{ readonly className?: string }>;
}

const OPTIONS: readonly ModeOption[] = [
  { mode: 'light', label: 'Light', Icon: Sun },
  { mode: 'dark', label: 'Dark', Icon: Moon },
  { mode: 'system', label: 'Match system', Icon: Monitor },
];

const BUTTON =
  'inline-flex size-7 items-center justify-center rounded-sm text-fg-subtle hover:text-fg ' +
  'aria-pressed:bg-surface aria-pressed:text-fg aria-pressed:shadow-xs';

/**
 * Reads the stored choice on the first client render.
 *
 * Safe to do lazily rather than in an effect because this control only ever mounts inside
 * the console shell, which itself renders only after the session has resolved in the
 * browser — there is no server-rendered markup for it to disagree with.
 */
function initialMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  return readStoredTheme(window.localStorage);
}

/** The appearance control, for the console's top bar. */
export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(initialMode);

  const choose = (next: ThemeMode): void => {
    setMode(next);
    storeTheme(next, window.localStorage);
    applyTheme(next, document.documentElement);
  };

  return (
    <div
      role="group"
      aria-label="Appearance"
      className="bg-surface-sunken flex items-center gap-0.5 rounded-md p-0.5"
    >
      {OPTIONS.map(({ mode: option, label, Icon }) => (
        <button
          key={option}
          type="button"
          aria-pressed={mode === option}
          title={label}
          onClick={() => choose(option)}
          className={cn(BUTTON, FOCUS_RING, TRANSITION_STATE)}
        >
          <Icon className="size-3.5" />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
