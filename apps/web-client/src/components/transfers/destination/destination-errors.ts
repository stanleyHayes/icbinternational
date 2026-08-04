'use client';

/**
 * What is missing from a destination, said in the customer's words.
 *
 * One validator per rail, chosen by kind, so adding a fifth rail is a new entry rather than a
 * fifth branch in a function nobody wants to touch. The messages describe the *shape* of the thing
 * being asked for — "a sort code is six digits" — because "invalid" tells somebody they are wrong
 * without telling them what right looks like.
 */

import { toDestination, TransferKind, type DestinationDraft } from './destination-draft';

/** Field-level messages, keyed by the field they belong to. */
export type DestinationErrors = Readonly<Record<string, string>>;

const ACCOUNT_NUMBER = /^\d{10}$/;
const SORT_CODE = /^\d{6}$/;

const RELIANCE_HINT =
  'Enter their 10-digit account number, the email address on their account, or their @handle.';
const NAME_HINT = 'Enter the name exactly as the bank holds it.';

function ownErrors(draft: DestinationDraft): DestinationErrors {
  if (draft.toAccountId) return {};
  return { toAccountId: 'Choose which of your accounts the money is going to.' };
}

/**
 * The Reliance reference is validated by the same narrowing the request uses.
 *
 * A second regular expression here would be a second definition of "what counts as a handle",
 * and the two would drift the first time one of them is relaxed.
 */
function relianceErrors(draft: DestinationDraft): DestinationErrors {
  return toDestination(draft) ? {} : { relianceRef: RELIANCE_HINT };
}

function domesticErrors(draft: DestinationDraft): DestinationErrors {
  const errors: Record<string, string> = {};
  if (!draft.accountName.trim()) errors.accountName = NAME_HINT;
  if (!SORT_CODE.test(draft.sortCode)) errors.sortCode = 'A sort code is six digits.';
  if (!ACCOUNT_NUMBER.test(draft.accountNumber)) {
    errors.accountNumber = 'A UK account number is ten digits.';
  }
  return errors;
}

function internationalErrors(draft: DestinationDraft): DestinationErrors {
  const errors: Record<string, string> = {};
  if (!draft.accountName.trim()) errors.accountName = NAME_HINT;
  if (!draft.iban.trim()) errors.iban = 'Enter the IBAN of the account you are paying.';
  if (!draft.bic.trim()) errors.bic = 'Enter the SWIFT or BIC code of the receiving bank.';
  if (!draft.bankName.trim()) errors.bankName = 'Enter the name of the receiving bank.';
  return errors;
}

const VALIDATE: Readonly<Record<TransferKind, (draft: DestinationDraft) => DestinationErrors>> = {
  [TransferKind.OWN]: ownErrors,
  [TransferKind.RELIANCE]: relianceErrors,
  [TransferKind.DOMESTIC]: domesticErrors,
  [TransferKind.INTERNATIONAL]: internationalErrors,
};

/** Messages for the fields the chosen rail needs and has not been given. */
export function destinationErrors(draft: DestinationDraft): DestinationErrors {
  return VALIDATE[draft.kind](draft);
}
