/**
 * The single-line text input.
 *
 * Adornments (a currency symbol, a search icon, a unit suffix) are rendered as siblings inside a
 * wrapper rather than as background images, so they can be `aria-hidden` and so the input's own
 * padding grows to match their measured width — text sliding under a `£` is the classic failure
 * of the background-image approach.
 */

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

import { DISABLED, FIELD_BASE, FOCUS_RING, TRANSITION_STATE } from '../foundation/styles.js';
import { cn } from '../lib/cn.js';

import { useFieldControl } from './field-context.js';

export type InputSize = 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Readonly<Record<InputSize, string>> = {
  sm: 'h-8 text-sm',
  md: 'h-10 text-base',
  lg: 'h-12 text-lg',
};

export interface InputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'size' | 'prefix' | 'suffix'
> {
  readonly inputSize?: InputSize;
  /** Decorative content pinned to the left edge, e.g. a currency symbol. */
  readonly prefix?: ReactNode;
  /** Decorative content pinned to the right edge, e.g. a unit or a clear button. */
  readonly suffix?: ReactNode;
  /** Class applied to the wrapper rather than the input. */
  readonly containerClassName?: string;
}

/**
 * @example <Input inputSize="lg" prefix="£" placeholder="0.00" />
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { inputSize = 'md', prefix, suffix, containerClassName, className, ...props },
  ref,
) {
  const field = useFieldControl();

  return (
    <div className={cn('relative flex items-center', containerClassName)}>
      {prefix && (
        <span aria-hidden="true" className="text-fg-muted pointer-events-none absolute left-3">
          {prefix}
        </span>
      )}
      <input
        ref={ref}
        className={cn(
          FIELD_BASE,
          SIZE_CLASSES[inputSize],
          FOCUS_RING,
          TRANSITION_STATE,
          DISABLED,
          prefix && 'pl-8',
          suffix && 'pr-10',
          className,
        )}
        {...field}
        {...props}
      />
      {suffix && <span className="text-fg-muted absolute right-3 flex items-center">{suffix}</span>}
    </div>
  );
});
