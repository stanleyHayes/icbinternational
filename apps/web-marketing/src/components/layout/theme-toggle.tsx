'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import { cn, FOCUS_RING, type ThemeMode } from '@reliance/ui';

const ICON_SIZE = 16;

const OPTIONS: readonly { readonly mode: ThemeMode; readonly label: string }[] = [
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
  { mode: 'system', label: 'Match my device' },
];

function iconFor(mode: ThemeMode) {
  if (mode === 'light') return <Sun size={ICON_SIZE} aria-hidden />;
  if (mode === 'dark') return <Moon size={ICON_SIZE} aria-hidden />;
  return <Monitor size={ICON_SIZE} aria-hidden />;
}

/**
 * Appearance control.
 *
 * A three-way radio group rather than a two-state switch, because "match my device" is a
 * real answer and a toggle cannot express it.
 *
 * `theme` is `undefined` until next-themes has read the stored preference, which is the
 * same on the server and on the client's first pass. Nothing is marked as checked in that
 * window — announcing the wrong option to a screen reader would be worse than announcing
 * none — and it fills in without a hydration mismatch.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className="rounded-pill border-border bg-surface inline-flex items-center gap-0.5 border p-0.5"
    >
      {OPTIONS.map((option) => (
        <ThemeOption
          key={option.mode}
          mode={option.mode}
          label={option.label}
          selected={theme === option.mode}
          onSelect={setTheme}
        />
      ))}
    </div>
  );
}

function ThemeOption({
  mode,
  label,
  selected,
  onSelect,
}: {
  readonly mode: ThemeMode;
  readonly label: string;
  readonly selected: boolean;
  readonly onSelect: (mode: ThemeMode) => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      onClick={() => onSelect(mode)}
      className={cn(
        'rounded-pill text-fg-muted grid size-7 place-items-center',
        'hover:text-fg transition-colors duration-(--rb-duration-fast)',
        selected && 'bg-accent-soft text-accent',
        FOCUS_RING,
      )}
    >
      {iconFor(mode)}
    </button>
  );
}
