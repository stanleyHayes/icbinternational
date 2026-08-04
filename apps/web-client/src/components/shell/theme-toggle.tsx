'use client';

/**
 * Light, dark, or follow the device.
 *
 * Three explicit options rather than a two-state switch. A switch cannot express "follow my
 * phone", which is what most people actually want, and a customer who set their phone to switch at
 * sunset should not have to set the bank separately.
 */

import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';

import { cn, FOCUS_RING, TRANSITION_STATE, type ThemeMode } from '@reliance/ui';

import { useTheme } from './theme-provider';

interface Option {
  readonly mode: ThemeMode;
  readonly label: string;
  readonly icon: LucideIcon;
}

const OPTIONS: readonly Option[] = [
  { mode: 'light', label: 'Light', icon: Sun },
  { mode: 'dark', label: 'Dark', icon: Moon },
  { mode: 'system', label: 'Match my device', icon: Monitor },
];

/** A radio group styled as a segmented control. */
export function ThemeToggle({ className }: { readonly className?: string }) {
  const { mode, setMode } = useTheme();

  return (
    <fieldset
      className={cn('bg-surface-sunken flex items-center gap-0.5 rounded-md p-0.5', className)}
    >
      <legend className="sr-only">Appearance</legend>
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const selected = mode === option.mode;

        return (
          <label
            key={option.mode}
            className={cn(
              'flex size-8 cursor-pointer items-center justify-center rounded-sm',
              TRANSITION_STATE,
              selected ? 'bg-surface text-fg shadow-xs' : 'text-fg-muted hover:text-fg',
              'has-[:focus-visible]:ring-focus has-[:focus-visible]:ring-2',
            )}
          >
            <input
              type="radio"
              name="appearance"
              value={option.mode}
              checked={selected}
              onChange={() => setMode(option.mode)}
              className={cn('sr-only', FOCUS_RING)}
            />
            <Icon aria-hidden="true" className="size-4" />
            <span className="sr-only">{option.label}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
