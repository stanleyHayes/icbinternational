'use client';

/**
 * The checkbox.
 *
 * A real `<input type="checkbox">` styled with `appearance-none` and a sibling glyph, rather than
 * a hidden input behind a `<div>`. The distinction matters: the real control keeps the native
 * space-bar behaviour, the form-reset behaviour, and the `indeterminate` state that a parent
 * "select all" needs — none of which a div can be given back.
 */

import { forwardRef, useEffect, useRef, type InputHTMLAttributes, type ReactNode } from 'react';

import { CheckIcon, MinusIcon } from '../foundation/icons.js';
import { DISABLED, FOCUS_RING, TRANSITION_STATE } from '../foundation/styles.js';
import { useMergedRefs } from '../hooks/use-merged-refs.js';
import { cn } from '../lib/cn.js';

import { useFieldControl } from './field-context.js';

const BOX_CLASSES =
  'peer size-5 shrink-0 appearance-none rounded-sm border border-border-strong bg-surface ' +
  'checked:border-accent checked:bg-accent indeterminate:border-accent indeterminate:bg-accent';

const GLYPH_CLASSES =
  'pointer-events-none absolute inset-0 m-auto size-3.5 text-accent-fg opacity-0';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /**
   * Neither checked nor unchecked — a "select all" box over a partial selection. Set on the DOM
   * node directly because HTML has no `indeterminate` attribute, only a property.
   */
  readonly indeterminate?: boolean;
  /** Label text. Rendering it inside the `<label>` makes the whole row a hit target. */
  readonly children?: ReactNode;
}

/**
 * @example <Checkbox checked={all} indeterminate={some} onChange={toggleAll}>Select all</Checkbox>
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, indeterminate = false, children, ...props },
  ref,
) {
  const field = useFieldControl();
  const inner = useRef<HTMLInputElement>(null);
  const mergedRef = useMergedRefs(ref, inner);

  useEffect(() => {
    if (inner.current) inner.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label className={cn('font-body text-fg inline-flex items-start gap-2 text-base', className)}>
      <span className="relative inline-flex">
        <input
          ref={mergedRef}
          type="checkbox"
          className={cn(BOX_CLASSES, FOCUS_RING, TRANSITION_STATE, DISABLED)}
          {...field}
          {...props}
        />
        <CheckIcon className={cn(GLYPH_CLASSES, 'peer-checked:opacity-100')} />
        <MinusIcon className={cn(GLYPH_CLASSES, 'peer-indeterminate:opacity-100')} />
      </span>
      {children}
    </label>
  );
});
