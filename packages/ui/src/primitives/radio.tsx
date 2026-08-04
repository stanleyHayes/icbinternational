/**
 * The radio button.
 *
 * Native, so arrow-key navigation within a `name` group comes for free — a hand-rolled radio has
 * to reimplement roving focus and almost always gets the wrap-around wrong.
 */

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

import { DISABLED, FOCUS_RING, TRANSITION_STATE } from '../foundation/styles.js';
import { cn } from '../lib/cn.js';

import { useFieldControl } from './field-context.js';

const DOT_CLASSES =
  'peer size-5 shrink-0 appearance-none rounded-pill border border-border-strong bg-surface ' +
  'checked:border-accent checked:bg-accent';

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Label text, rendered inside the `<label>` so the text is part of the hit target. */
  readonly children?: ReactNode;
  /** Secondary line under the label — an account number, a fee, a delivery estimate. */
  readonly description?: ReactNode;
}

/**
 * @example
 * <Radio name="speed" value="instant" description="Arrives in seconds">Instant</Radio>
 */
export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { className, children, description, ...props },
  ref,
) {
  const field = useFieldControl();

  return (
    <label className={cn('font-body text-fg inline-flex items-start gap-2 text-base', className)}>
      <span className="relative inline-flex">
        <input
          ref={ref}
          type="radio"
          className={cn(DOT_CLASSES, FOCUS_RING, TRANSITION_STATE, DISABLED)}
          {...field}
          {...props}
        />
        <span
          aria-hidden="true"
          className={cn(
            'rounded-pill bg-accent-fg pointer-events-none absolute inset-0 m-auto size-2',
            'opacity-0 peer-checked:opacity-100',
            TRANSITION_STATE,
          )}
        />
      </span>
      <span className="flex flex-col">
        <span>{children}</span>
        {description && <span className="text-fg-muted text-sm">{description}</span>}
      </span>
    </label>
  );
});
