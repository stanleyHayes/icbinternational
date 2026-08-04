'use client';

/**
 * The FormField wrapper: label, control, hint and error, wired together.
 *
 * Every id and every ARIA relationship is derived here so that no call site has to remember them.
 * The alternative — each screen hand-writing `aria-describedby={`${id}-error`}` — is how a form
 * ends up 90% accessible, which for a screen-reader user is a form that fails on the one field
 * they got wrong.
 */

import { useId, useMemo, type ReactNode } from 'react';

import { cn } from '../lib/cn.js';

import { FieldContext, type FieldContextValue } from './field-context.js';
import { FieldError } from './field-error.js';
import { Label } from './label.js';

export interface FormFieldProps {
  /** Visible label text. Omit only when the control is labelled some other way. */
  readonly label?: ReactNode;
  /** Helper text shown under the control and read out after the label. */
  readonly hint?: ReactNode;
  /** Validation message. Its presence is what marks the field invalid. */
  readonly error?: string | false | null;
  readonly required?: boolean;
  readonly disabled?: boolean;
  /** Overrides the generated control id — use when a server-rendered id must be stable. */
  readonly id?: string;
  readonly className?: string;
  readonly children: ReactNode;
}

/**
 * @example
 * <FormField label="Amount" hint="Sent today" error={errors.amount?.message} required>
 *   <CurrencyInput currency="GBP" value={amount} onValueChange={setAmount} />
 * </FormField>
 */
export function FormField(props: FormFieldProps) {
  const { label, hint, error, required = false, disabled = false, className, children } = props;
  const generatedId = useId();
  const controlId = props.id ?? generatedId;

  const context = useMemo<FieldContextValue>(
    () => ({
      controlId,
      // The hint is replaced by the error, not stacked under it: two competing instructions on a
      // field the user has already failed once is noise. The id follows what is actually rendered,
      // because `aria-describedby` pointing at a removed node describes nothing.
      descriptionId: hint && !error ? `${controlId}-hint` : undefined,
      errorId: error ? `${controlId}-error` : undefined,
      invalid: Boolean(error),
      required,
      disabled,
    }),
    [controlId, hint, error, required, disabled],
  );

  return (
    <FieldContext.Provider value={context}>
      <div className={cn('flex flex-col gap-1.5', className)}>
        {label && <Label>{label}</Label>}
        {children}
        {hint && !error && (
          <p id={context.descriptionId} className="font-body text-fg-muted text-sm">
            {hint}
          </p>
        )}
        <FieldError>{error}</FieldError>
      </div>
    </FieldContext.Provider>
  );
}
