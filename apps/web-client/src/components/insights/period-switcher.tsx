'use client';

/**
 * Choosing the window.
 *
 * A radio group rather than a row of buttons, because that is what it is: one choice from four,
 * mutually exclusive. The keyboard model comes free — arrow keys move between the options and Tab
 * leaves the group — and a screen reader announces "Last 30 days, radio button, 1 of 4" instead
 * of four unrelated buttons.
 *
 * The choice is written to the URL, so the window travels with a shared link.
 */

import { cn, FOCUS_RING, TRANSITION_STATE } from '@reliance/ui';

import { PERIOD_LABEL, PERIOD_ORDER, type Period } from './period';

const GROUP_NAME = 'insights-period';

/** Props for {@link PeriodSwitcher}. */
export interface PeriodSwitcherProps {
  readonly value: Period;
  readonly onChange: (period: Period) => void;
}

/**
 * @example <PeriodSwitcher value={period} onChange={setPeriod} />
 */
export function PeriodSwitcher({ value, onChange }: PeriodSwitcherProps) {
  return (
    <fieldset className="rounded-pill border-border bg-surface flex flex-wrap items-center gap-1 border p-1">
      <legend className="sr-only">Choose the period these figures cover</legend>
      {PERIOD_ORDER.map((period) => {
        const selected = period === value;
        return (
          <label
            key={period}
            className={cn(
              'rounded-pill cursor-pointer px-3 py-1.5 text-sm font-medium',
              selected ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:text-fg',
              'has-[:focus-visible]:ring-focus has-[:focus-visible]:ring-2',
              TRANSITION_STATE,
            )}
          >
            <input
              type="radio"
              name={GROUP_NAME}
              value={period}
              checked={selected}
              onChange={() => onChange(period)}
              className={cn('sr-only', FOCUS_RING)}
            />
            {PERIOD_LABEL[period]}
          </label>
        );
      })}
    </fieldset>
  );
}
