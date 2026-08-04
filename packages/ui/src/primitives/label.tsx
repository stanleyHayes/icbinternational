/**
 * The field label.
 *
 * Always a real `<label>` bound by `htmlFor`, which is what makes the label a click target for
 * the control — a 40px checkbox is hard to hit, a checkbox plus its label is not.
 */

import { forwardRef, type LabelHTMLAttributes } from 'react';

import { cn } from '../lib/cn.js';

import { useFieldContext } from './field-context.js';

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  /**
   * Marks the field as required. Renders an asterisk that is hidden from assistive tech, because
   * the control's own `required`/`aria-required` already announces it — otherwise the user hears
   * "star" in the middle of the field name.
   */
  readonly required?: boolean;
}

/**
 * Inside a FormField, `htmlFor` is supplied automatically.
 *
 * @example <Label htmlFor="iban" required>IBAN</Label>
 */
export const Label = forwardRef<HTMLLabelElement, LabelProps>(function Label(
  { className, required, children, htmlFor, ...props },
  ref,
) {
  const field = useFieldContext();
  const isRequired = required ?? field?.required ?? false;

  return (
    <label
      ref={ref}
      htmlFor={htmlFor ?? field?.controlId}
      className={cn(
        'font-body text-fg inline-flex items-center gap-1 text-sm font-medium',
        field?.disabled && 'opacity-60',
        className,
      )}
      {...props}
    >
      {children}
      {isRequired && (
        <span aria-hidden="true" className="text-danger">
          *
        </span>
      )}
    </label>
  );
});
