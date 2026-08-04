/**
 * The select.
 *
 * A native `<select>`, not a listbox reimplementation. On mobile it opens the platform picker, it
 * works with a screen reader out of the box, and it survives being inside a form that posts
 * without JavaScript. A custom listbox is the right answer only when options need rich content —
 * that is Combobox's job, not this one's.
 */

import { forwardRef, type ReactNode, type SelectHTMLAttributes } from 'react';

import { ChevronDownIcon } from '../foundation/icons.js';
import { DISABLED, FIELD_BASE, FOCUS_RING, TRANSITION_STATE } from '../foundation/styles.js';
import { cn } from '../lib/cn.js';

import { useFieldControl } from './field-context.js';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export type SelectSize = 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Readonly<Record<SelectSize, string>> = {
  sm: 'h-8 text-sm',
  md: 'h-10 text-base',
  lg: 'h-12 text-lg',
};

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  readonly selectSize?: SelectSize;
  /** Options as data. Ignored when `children` are supplied, for `<optgroup>` cases. */
  readonly options?: readonly SelectOption[];
  /**
   * Renders a disabled, selected-by-default first option. Its value is the empty string, so a
   * required select rejects "no choice" rather than silently defaulting to the first currency.
   */
  readonly placeholder?: string;
  readonly children?: ReactNode;
}

/**
 * @example <Select placeholder="Choose a currency" options={currencies} />
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { selectSize = 'md', options, placeholder, className, children, ...props },
  ref,
) {
  const field = useFieldControl();

  return (
    <div className="relative flex items-center">
      <select
        ref={ref}
        className={cn(
          FIELD_BASE,
          SIZE_CLASSES[selectSize],
          'appearance-none pr-9',
          FOCUS_RING,
          TRANSITION_STATE,
          DISABLED,
          className,
        )}
        {...field}
        {...props}
      >
        {placeholder !== undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {children ??
          options?.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
      </select>
      <ChevronDownIcon className="text-fg-muted pointer-events-none absolute right-3" />
    </div>
  );
});
