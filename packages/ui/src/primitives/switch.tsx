'use client';

/**
 * The switch.
 *
 * A switch is not a checkbox: it applies immediately and has no submit step. "Freeze card" takes
 * effect the instant it moves, so it is built on `role="switch"` and the label must read as a
 * state, not an instruction — "Card frozen", never "Freeze card?".
 *
 * Built on a real checkbox input with `role="switch"`, which keeps space-bar activation and form
 * participation while announcing "on"/"off" rather than "checked"/"unchecked".
 */

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

import { DISABLED, FOCUS_RING, TRANSITION_STATE } from '../foundation/styles.js';
import { cn } from '../lib/cn.js';

import { useFieldControl } from './field-context.js';

const TRACK_CLASSES =
  'peer h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-pill bg-border-strong ' +
  'checked:bg-accent';

const THUMB_CLASSES =
  'pointer-events-none absolute top-0.5 left-0.5 size-5 rounded-pill bg-surface shadow-xs ' +
  'transition-transform duration-(--rb-duration-fast) ease-standard peer-checked:translate-x-5';

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'role'> {
  /** Label text describing the *state*, placed after the control. */
  readonly children?: ReactNode;
  /** Secondary line — what turning it on actually does. */
  readonly description?: ReactNode;
}

/**
 * @example <Switch checked={frozen} onChange={onToggle}>Card frozen</Switch>
 */
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { className, children, description, ...props },
  ref,
) {
  const field = useFieldControl();

  return (
    <label className={cn('font-body text-fg inline-flex items-start gap-3 text-base', className)}>
      <span className="relative inline-flex shrink-0">
        <input
          ref={ref}
          type="checkbox"
          role="switch"
          className={cn(TRACK_CLASSES, FOCUS_RING, TRANSITION_STATE, DISABLED)}
          {...field}
          {...props}
        />
        <span aria-hidden="true" className={THUMB_CLASSES} />
      </span>
      {(children || description) && (
        <span className="flex flex-col">
          <span>{children}</span>
          {description && <span className="text-fg-muted text-sm">{description}</span>}
        </span>
      )}
    </label>
  );
});
