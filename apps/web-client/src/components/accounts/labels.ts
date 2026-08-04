/**
 * What the bank calls each kind of account, and each state one can be in.
 *
 * The states matter more than the names. "Dormant" and "Frozen" look similar in a list and mean
 * entirely different things to somebody trying to pay their rent, so each carries a sentence
 * explaining what it means for them rather than a badge and nothing else.
 */

import { AccountStatus, AccountType } from '@reliance/contracts';
import type { Tone } from '@reliance/ui';

/** Product families, in the customer's words. */
export const ACCOUNT_TYPE_LABEL: Readonly<Record<AccountType, string>> = {
  [AccountType.CURRENT]: 'Current account',
  [AccountType.SAVINGS]: 'Savings account',
  [AccountType.JOINT]: 'Joint account',
  [AccountType.BUSINESS]: 'Business account',
  [AccountType.FX_WALLET]: 'Currency wallet',
  [AccountType.FIXED_DEPOSIT]: 'Fixed deposit',
  [AccountType.LOAN]: 'Loan',
};

/** Short state labels, for badges and pills. */
export const ACCOUNT_STATUS_LABEL: Readonly<Record<AccountStatus, string>> = {
  [AccountStatus.PENDING]: 'Being opened',
  [AccountStatus.ACTIVE]: 'Open',
  [AccountStatus.FROZEN]: 'Frozen',
  [AccountStatus.DORMANT]: 'Dormant',
  [AccountStatus.CLOSING]: 'Closing',
  [AccountStatus.CLOSED]: 'Closed',
};

/** What each state means for the person holding the account. */
export const ACCOUNT_STATUS_EXPLANATION: Readonly<Record<AccountStatus, string>> = {
  [AccountStatus.PENDING]:
    'We are still setting this account up. You will be able to pay in and out as soon as it is ready.',
  [AccountStatus.ACTIVE]: 'Money can go in and out as normal.',
  [AccountStatus.FROZEN]:
    'Payments in and out are blocked while we look into something. Call us on 0800 460 0460 and we will explain what we need.',
  [AccountStatus.DORMANT]:
    'This account has not been used for a long time, so we have made it dormant. Reactivate it in a couple of minutes by calling us on 0800 460 0460.',
  [AccountStatus.CLOSING]:
    'This account is closing. Any remaining balance is being moved, and it will disappear from your list once that is done.',
  [AccountStatus.CLOSED]:
    'This account is closed. Its statements stay here for six years, and you can still download them.',
};

/** Tone for the state badge. The label always carries the meaning; the colour only speeds it up. */
export const ACCOUNT_STATUS_TONE: Readonly<Record<AccountStatus, Tone>> = {
  [AccountStatus.PENDING]: 'pending',
  [AccountStatus.ACTIVE]: 'success',
  [AccountStatus.FROZEN]: 'danger',
  [AccountStatus.DORMANT]: 'warning',
  [AccountStatus.CLOSING]: 'warning',
  [AccountStatus.CLOSED]: 'neutral',
};

/** The three tones `AccountCard` accepts for its state badge. */
export const CARD_STATUS_TONE: Readonly<Record<AccountStatus, 'pending' | 'danger' | 'neutral'>> = {
  [AccountStatus.PENDING]: 'pending',
  [AccountStatus.ACTIVE]: 'neutral',
  [AccountStatus.FROZEN]: 'danger',
  [AccountStatus.DORMANT]: 'pending',
  [AccountStatus.CLOSING]: 'pending',
  [AccountStatus.CLOSED]: 'neutral',
};

/** States in which money can still move. */
export function isOperable(status: AccountStatus): boolean {
  return status === AccountStatus.ACTIVE;
}

/** States in which the account still appears in the customer's day-to-day list. */
export function isOpen(status: AccountStatus): boolean {
  return status !== AccountStatus.CLOSED;
}

/** `403080` → `40-30-80`, which is how a sort code is written on a cheque and read aloud. */
export function formatSortCode(sortCode: string): string {
  return sortCode.replaceAll(/(\d{2})(?=\d)/g, '$1-');
}

/** `GB29RELI40308012345678` → `GB29 RELI 4030 8012 3456 78`, the printed grouping. */
export function formatIban(iban: string): string {
  return iban.replaceAll(/(.{4})(?=.)/g, '$1 ');
}

const BPS_PER_PERCENT = 100;

/** `325` basis points → `3.25% AER`. Integer maths only: the rate is a fact, not an estimate. */
export function formatRateBps(bps: number): string {
  const whole = Math.trunc(bps / BPS_PER_PERCENT);
  const fraction = Math.abs(bps % BPS_PER_PERCENT)
    .toString()
    .padStart(2, '0');
  return `${whole}.${fraction}% AER`;
}
