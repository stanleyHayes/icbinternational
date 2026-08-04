/**
 * The shape every form on the site reports back in.
 *
 * One type, so the error summary, the field-level messages and the live region behave
 * identically on the contact form and the newsletter box. A customer who has learned how
 * one of our forms tells them something went wrong has learned all of them.
 */

import { ApiClientError } from '@reliance/api-client';

/** Per-field messages, keyed by the field's `name`. */
export type FieldErrors = Readonly<Record<string, string>>;

/** What a form action returns. */
export interface FormState {
  readonly status: 'idle' | 'success' | 'error';
  /** Shown in the form's live region. Empty while idle. */
  readonly message: string;
  readonly fieldErrors: FieldErrors;
}

/** The starting state, before anything has been submitted. */
export const IDLE_FORM_STATE: FormState = { status: 'idle', message: '', fieldErrors: {} };

/** A successful submission. */
export function succeeded(message: string): FormState {
  return { status: 'success', message, fieldErrors: {} };
}

/** A refusal the customer can act on. */
export function failed(message: string, fieldErrors: FieldErrors = {}): FormState {
  return { status: 'error', message, fieldErrors };
}

/**
 * The message shown when the bank, rather than the customer, is at fault.
 *
 * Never the underlying error: a stack trace or a status code tells the customer nothing
 * they can use and quite a lot they should not see.
 */
const UNEXPECTED_FAILURE =
  'We could not send that just now. Please try again in a moment, or call us on 020 7946 0100.';

/** Turns a rejected API call into something a person can read. */
export function fromApiFailure(error: unknown): FormState {
  if (!ApiClientError.isApiClientError(error)) return failed(UNEXPECTED_FAILURE);

  const fieldErrors: Record<string, string> = {};
  for (const detail of error.details) {
    const field = detail.path.split('.').at(-1);
    if (field) fieldErrors[field] = detail.message;
  }

  return failed(
    Object.keys(fieldErrors).length > 0
      ? 'Please check the highlighted fields and try again.'
      : UNEXPECTED_FAILURE,
    fieldErrors,
  );
}

/** Turns a Zod issue list into field messages. */
export function fromIssues(
  issues: readonly { readonly path: readonly PropertyKey[]; readonly message: string }[],
): FormState {
  const fieldErrors: Record<string, string> = {};

  for (const issue of issues) {
    const field = issue.path.at(-1);
    if (typeof field === 'string' && !(field in fieldErrors)) fieldErrors[field] = issue.message;
  }

  return failed('Please check the highlighted fields and try again.', fieldErrors);
}
