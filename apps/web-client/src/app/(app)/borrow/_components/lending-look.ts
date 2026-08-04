'use client';

/**
 * Lending vocabulary, in the customer's words.
 *
 * An APR lives in the contract as basis points because that is the only way to hold it exactly.
 * It reaches a screen as a percentage, formatted from the integer, so 14.99% is 14.99% rather than
 * a float that renders one digit short.
 */

import { LoanApplicationStatus, LoanKind, LoanStatus } from '@reliance/contracts';
import type { Tone } from '@reliance/ui';

const BPS_PER_PERCENT = 100;
const PERCENT_DECIMALS = 2;

/** Basis points as an exact percentage string. */
export function aprLabel(bps: number): string {
  return `${(bps / BPS_PER_PERCENT).toFixed(PERCENT_DECIMALS)}%`;
}

/** A status as the customer reads it. */
export interface LendingLook {
  readonly label: string;
  readonly tone: Tone;
}

/** Where an application has got to. */
export const APPLICATION_STATUS: Readonly<Record<LoanApplicationStatus, LendingLook>> = {
  [LoanApplicationStatus.DRAFT]: { label: 'Not submitted', tone: 'neutral' },
  [LoanApplicationStatus.SUBMITTED]: { label: 'With us', tone: 'pending' },
  [LoanApplicationStatus.UNDER_REVIEW]: { label: 'Being reviewed', tone: 'pending' },
  [LoanApplicationStatus.REFERRED]: { label: 'With an underwriter', tone: 'pending' },
  [LoanApplicationStatus.APPROVED]: { label: 'Approved', tone: 'credit' },
  [LoanApplicationStatus.DECLINED]: { label: 'Not approved', tone: 'danger' },
  [LoanApplicationStatus.OFFER_MADE]: { label: 'Offer ready', tone: 'accent' },
  [LoanApplicationStatus.OFFER_ACCEPTED]: { label: 'Offer accepted', tone: 'credit' },
  [LoanApplicationStatus.OFFER_EXPIRED]: { label: 'Offer expired', tone: 'neutral' },
  [LoanApplicationStatus.WITHDRAWN]: { label: 'Withdrawn', tone: 'neutral' },
  [LoanApplicationStatus.DISBURSED]: { label: 'Paid out', tone: 'credit' },
};

/** How a live loan is doing. */
export const LOAN_STATUS: Readonly<Record<LoanStatus, LendingLook>> = {
  [LoanStatus.ACTIVE]: { label: 'Up to date', tone: 'credit' },
  [LoanStatus.IN_ARREARS]: { label: 'Behind on payments', tone: 'danger' },
  [LoanStatus.SETTLED]: { label: 'Paid off', tone: 'neutral' },
  [LoanStatus.WRITTEN_OFF]: { label: 'Written off', tone: 'neutral' },
  [LoanStatus.RESTRUCTURED]: { label: 'Restructured', tone: 'info' },
};

/** What each kind of borrowing is called. */
export const LOAN_KIND: Readonly<Record<LoanKind, string>> = {
  [LoanKind.PERSONAL]: 'Personal loan',
  [LoanKind.AUTO]: 'Car loan',
  [LoanKind.MORTGAGE]: 'Mortgage',
  [LoanKind.BUSINESS]: 'Business loan',
  [LoanKind.OVERDRAFT]: 'Overdraft',
};

/** Statuses where an offer is on the table and can still be accepted. */
export const OFFER_OPEN: ReadonlySet<LoanApplicationStatus> = new Set([
  LoanApplicationStatus.OFFER_MADE,
  LoanApplicationStatus.APPROVED,
]);

/** Statuses where the application is still moving and worth checking back on. */
export const IN_PROGRESS: ReadonlySet<LoanApplicationStatus> = new Set([
  LoanApplicationStatus.SUBMITTED,
  LoanApplicationStatus.UNDER_REVIEW,
  LoanApplicationStatus.REFERRED,
]);
