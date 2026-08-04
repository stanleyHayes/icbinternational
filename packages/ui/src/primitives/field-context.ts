'use client';

/**
 * The wiring between a FormField and the control inside it.
 *
 * Label association, `aria-describedby` and `aria-invalid` are the three things every form gets
 * wrong, and they are wrong in a way nobody notices with a mouse: the field looks red, but the
 * screen-reader user is told nothing about why their transfer was rejected. Doing it in context
 * means a control cannot be dropped into a FormField and forget.
 *
 * The hook supplies *defaults*. Controls spread it **before** their own props — `{...field}
 * {...props}` — so an explicit `aria-invalid` or `disabled` at the call site still wins, without
 * this module having to merge two sources of truth for every attribute.
 */

import { createContext, useContext } from 'react';

export interface FieldContextValue {
  /** `id` of the control itself — the Label's `htmlFor` target. */
  readonly controlId: string;
  /** `id` of the hint text, when it is rendered. */
  readonly descriptionId: string | undefined;
  /** `id` of the error text, when it is rendered. */
  readonly errorId: string | undefined;
  readonly invalid: boolean;
  readonly required: boolean;
  readonly disabled: boolean;
}

/** Null outside a FormField — every control must also work standalone. */
export const FieldContext = createContext<FieldContextValue | null>(null);

/** Reads the enclosing FormField, or `null` when the control is used on its own. */
export function useFieldContext(): FieldContextValue | null {
  return useContext(FieldContext);
}

/** The attributes a control inherits from its FormField. */
export interface FieldControlAttributes {
  readonly id: string | undefined;
  readonly 'aria-describedby': string | undefined;
  readonly 'aria-invalid': true | undefined;
  readonly required: boolean | undefined;
  readonly disabled: boolean | undefined;
}

/**
 * Attributes for the control inside the current FormField.
 *
 * The error id comes *after* the description id because assistive tech reads `aria-describedby`
 * in order, and "amount is above your daily limit" matters more than the hint that preceded it.
 */
export function useFieldControl(): FieldControlAttributes {
  const field = useFieldContext();
  const described = [field?.descriptionId, field?.errorId].filter(Boolean).join(' ');

  return {
    id: field?.controlId,
    'aria-describedby': described.length > 0 ? described : undefined,
    'aria-invalid': field?.invalid ? true : undefined,
    required: field?.required,
    disabled: field?.disabled,
  };
}
