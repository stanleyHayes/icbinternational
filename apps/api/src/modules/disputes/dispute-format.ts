import { formatMinor } from '@reliance/money';

import { type StoredMoney, fromStored } from '../../common/money/money.codec.js';

import { NOTIFICATION_LOCALE } from './disputes.constants.js';

/** An amount as the customer reads it, e.g. `£312.00`. */
export function formatStoredAmount(stored: StoredMoney): string {
  const money = fromStored(stored);
  return formatMinor(money.amount, money.currency, { locale: NOTIFICATION_LOCALE });
}

/** A deadline as the customer reads it, e.g. `12 April 2026`. */
export function formatDeadline(date: Date): string {
  return new Intl.DateTimeFormat(NOTIFICATION_LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * The customer's own account of the problem, shortened to fit a statement line.
 *
 * The projector copies a journal entry's description onto the transaction row, and the
 * contract caps that at 120 characters — a dispute description may run to five thousand.
 * Trimming keeps the customer's own words next to the credit on their statement rather
 * than replacing them with a case number they would not recognise.
 */
export function ledgerLabel(description: string): string {
  const collapsed = description.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= LEDGER_LABEL_MAX) return collapsed;
  return `${collapsed.slice(0, LEDGER_LABEL_MAX - 1).trimEnd()}…`;
}

/** Leaves room for the longest prefix a dispute entry description carries. */
const LEDGER_LABEL_MAX = 80;
