'use client';

/**
 * The four ways to send money, held as one draft.
 *
 * The contract models a destination as a discriminated union, which is right on the wire and
 * awkward in a form: switching from a domestic payment to an international one should not throw
 * away the amount and the reference the customer has already typed. So the form keeps every field
 * flat and `toDestination` narrows it at the last moment.
 *
 * A Reliance-to-Reliance payment is identified by one field that accepts three kinds of thing —
 * an account number, an email address or an `@handle`. Asking the customer which of the three they
 * are about to paste is a question the interface can answer for itself.
 */

import type { TransferDestination } from '@reliance/contracts';

/** How the customer is sending the money. */
export const TransferKind = {
  OWN: 'OWN',
  RELIANCE: 'RELIANCE',
  DOMESTIC: 'DOMESTIC',
  INTERNATIONAL: 'INTERNATIONAL',
} as const;
export type TransferKind = (typeof TransferKind)[keyof typeof TransferKind];

/** Every field any of the four destinations can need. */
export interface DestinationDraft {
  readonly kind: TransferKind;
  /** OWN: the customer's other account. */
  readonly toAccountId: string;
  /** RELIANCE: an account number, an email address or an `@handle`. */
  readonly relianceRef: string;
  readonly accountName: string;
  readonly accountNumber: string;
  readonly sortCode: string;
  readonly bankName: string;
  readonly iban: string;
  readonly bic: string;
  readonly country: string;
  /** Set when the destination came from a saved payee rather than being typed. */
  readonly payeeId: string;
}

const ACCOUNT_NUMBER = /^\d{10}$/;
const SORT_CODE = /^\d{6}$/;
const HANDLE = /^@[a-z0-9_]{3,20}$/;
const WHITESPACE = /\s/g;

/** A blank draft. */
export const EMPTY_DRAFT: DestinationDraft = {
  kind: TransferKind.OWN,
  toAccountId: '',
  relianceRef: '',
  accountName: '',
  accountNumber: '',
  sortCode: '',
  bankName: '',
  iban: '',
  bic: '',
  country: 'GB',
  payeeId: '',
};

/** Narrows a free-text Reliance reference into the field the contract expects. */
function internalFromReference(reference: string): TransferDestination | null {
  const value = reference.trim();
  if (ACCOUNT_NUMBER.test(value)) return { kind: 'INTERNAL', accountNumber: value };
  if (HANDLE.test(value.toLowerCase())) return { kind: 'INTERNAL', handle: value.toLowerCase() };
  if (value.includes('@') && value.includes('.')) {
    return { kind: 'INTERNAL', email: value.toLowerCase() };
  }
  return null;
}

function domesticFrom(draft: DestinationDraft): TransferDestination | null {
  const complete =
    draft.accountName.trim() !== '' &&
    ACCOUNT_NUMBER.test(draft.accountNumber) &&
    SORT_CODE.test(draft.sortCode);
  if (!complete) return null;

  return {
    kind: 'DOMESTIC',
    accountName: draft.accountName.trim(),
    accountNumber: draft.accountNumber,
    sortCode: draft.sortCode,
    ...(draft.bankName ? { bankName: draft.bankName.trim() } : {}),
  };
}

function internationalFrom(draft: DestinationDraft): TransferDestination | null {
  const complete = [draft.accountName, draft.iban, draft.bic, draft.bankName, draft.country].every(
    (value) => value.trim() !== '',
  );
  if (!complete) return null;

  return {
    kind: 'INTERNATIONAL',
    accountName: draft.accountName.trim(),
    iban: draft.iban.replaceAll(WHITESPACE, '').toUpperCase(),
    bic: draft.bic.trim().toUpperCase(),
    bankName: draft.bankName.trim(),
    country: draft.country,
  };
}

/** One narrowing per rail, chosen by kind rather than by a chain of branches. */
const NARROW: Readonly<
  Record<TransferKind, (draft: DestinationDraft) => TransferDestination | null>
> = {
  [TransferKind.OWN]: (draft) =>
    draft.toAccountId ? { kind: 'INTERNAL', accountId: draft.toAccountId } : null,
  [TransferKind.RELIANCE]: (draft) => internalFromReference(draft.relianceRef),
  [TransferKind.DOMESTIC]: domesticFrom,
  [TransferKind.INTERNATIONAL]: internationalFrom,
};

/** The contract destination for a draft, or `null` while it is still incomplete. */
export function toDestination(draft: DestinationDraft): TransferDestination | null {
  return NARROW[draft.kind](draft);
}

/** How a destination reads on a review screen or a receipt. */
export function describeDestination(destination: TransferDestination): string {
  if (destination.kind === 'INTERNAL') {
    return destination.handle ?? destination.email ?? destination.accountNumber ?? 'Your account';
  }
  return destination.accountName;
}
