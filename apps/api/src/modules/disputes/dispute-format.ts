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
