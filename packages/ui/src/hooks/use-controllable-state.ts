'use client';

/**
 * Controlled/uncontrolled state, resolved once so every component behaves the same way.
 *
 * A component that only works controlled forces every caller to write boilerplate; one that only
 * works uncontrolled cannot participate in a form. Getting the switch subtly wrong per component
 * is how a library ends up with a Switch that ignores `checked` and a Tabs that ignores `value`.
 */

import { useCallback, useState } from 'react';

export interface ControllableStateOptions<T> {
  /** When defined, the component is controlled and never stores its own value. */
  readonly value?: T;
  /** Initial value while uncontrolled. */
  readonly defaultValue: T;
  /** Called on every change, controlled or not. */
  readonly onChange?: (next: T) => void;
}

/**
 * Returns the effective value and a setter that updates internal state only when uncontrolled.
 *
 * The controlled branch still calls `onChange`, so a controlled component that forgets to update
 * its own state simply does not move — the visible failure, rather than a component that appears
 * to work locally and desynchronises from the parent.
 */
export function useControllableState<T>(
  options: ControllableStateOptions<T>,
): readonly [T, (next: T) => void] {
  const { value, defaultValue, onChange } = options;
  const [internal, setInternal] = useState<T>(defaultValue);
  const isControlled = value !== undefined;

  const setValue = useCallback(
    (next: T) => {
      if (!isControlled) setInternal(next);
      onChange?.(next);
    },
    [isControlled, onChange],
  );

  return [isControlled ? value : internal, setValue] as const;
}
