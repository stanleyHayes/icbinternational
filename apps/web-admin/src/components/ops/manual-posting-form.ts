/**
 * The shape of a manual posting while an operator is still typing it.
 *
 * Kept apart from the fields that render it so the validation can be reasoned about — and
 * tested — without a DOM. Validation is the contract's own schema rather than a second
 * set of rules written here, so the console refuses exactly what the platform refuses,
 * with the same messages.
 */

import {
  manualPostingRequestSchema,
  PostingDirection,
  type ManualPostingRequest,
} from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';

/** The reporting currency a posting defaults to. */
export const DEFAULT_CURRENCY: CurrencyCode = 'GBP';

/** A manual posting as the form holds it, before it is known to be valid. */
export interface PostingDraft {
  readonly accountId: string;
  readonly direction: PostingDirection;
  /** Integer minor units, as the currency input produces them. */
  readonly amount: string;
  readonly currency: CurrencyCode;
  readonly contraLedgerCode: string;
  readonly narrative: string;
  readonly justification: string;
}

/** An empty draft, optionally pre-filled from the record the operator came from. */
export function emptyDraft(defaults?: Partial<PostingDraft>): PostingDraft {
  return {
    accountId: '',
    direction: PostingDirection.DEBIT,
    amount: '0',
    currency: DEFAULT_CURRENCY,
    contraLedgerCode: '',
    narrative: '',
    justification: '',
    ...defaults,
  };
}

/** The draft as the platform would receive it. */
export function toRequest(draft: PostingDraft): ManualPostingRequest {
  return {
    accountId: draft.accountId.trim(),
    direction: draft.direction,
    amount: { amount: draft.amount, currency: draft.currency },
    contraLedgerCode: draft.contraLedgerCode.trim(),
    narrative: draft.narrative.trim(),
    justification: draft.justification.trim(),
  };
}

/**
 * Field-level failures keyed by field name.
 *
 * Only the first failure per field is kept: a form that lists three problems with one box
 * is a form nobody reads to the end.
 */
export function draftErrors(draft: PostingDraft): Readonly<Record<string, string>> {
  const result = manualPostingRequestSchema.safeParse(toRequest(draft));
  if (result.success) return {};

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && errors[field] === undefined) errors[field] = issue.message;
  }
  return errors;
}

/** True when the platform would accept this draft as it stands. */
export function isDraftValid(draft: PostingDraft): boolean {
  return manualPostingRequestSchema.safeParse(toRequest(draft)).success;
}
