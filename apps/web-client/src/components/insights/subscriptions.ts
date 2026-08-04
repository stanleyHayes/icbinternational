/**
 * What a set of recurring charges costs per month.
 *
 * An annual subscription is not "£120 this month" and it is not "£0 this month" either. It is
 * £10 a month, and saying so is the only version of the figure a customer can use to decide
 * whether to keep it. The apportionment is integer division on `bigint` minor units, so twelve
 * apportioned months of a £120 charge come to £120 and not £119.99.
 *
 * Mixed currencies are not summed. A euro subscription and a sterling one add to nothing
 * meaningful, so anything outside the leading currency is left out and the caller can say so.
 */

import type { Money, Subscription } from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';

/** How often a merchant charges, in the customer's words. */
export const CADENCE_LABEL: Readonly<Record<Subscription['cadence'], string>> = {
  WEEKLY: 'Every week',
  MONTHLY: 'Every month',
  QUARTERLY: 'Every three months',
  ANNUAL: 'Once a year',
};

/**
 * Charges per year for each cadence.
 *
 * Weekly is 52, not 52.18: a customer counting the charges on their statement will count 52 in
 * most years, and a fractional week is a precision nobody asked for.
 */
const CHARGES_PER_YEAR: Readonly<Record<Subscription['cadence'], bigint>> = {
  WEEKLY: 52n,
  MONTHLY: 12n,
  QUARTERLY: 4n,
  ANNUAL: 1n,
};

const MONTHS_PER_YEAR = 12n;

/** The bank's reporting currency, and the fallback for an empty list. */
const FALLBACK_CURRENCY: CurrencyCode = 'GBP';

/**
 * The monthly cost of a set of subscriptions, in the currency most of them are charged in.
 *
 * @param subscriptions the detected recurring charges.
 */
export function monthlyEquivalent(subscriptions: readonly Subscription[]): Money {
  const currency = subscriptions[0]?.amount.currency ?? FALLBACK_CURRENCY;

  let yearlyMinor = 0n;
  for (const subscription of subscriptions) {
    if (subscription.amount.currency !== currency) continue;
    const magnitude = BigInt(subscription.amount.amount);
    const positive = magnitude < 0n ? -magnitude : magnitude;
    yearlyMinor += positive * CHARGES_PER_YEAR[subscription.cadence];
  }

  return { amount: (yearlyMinor / MONTHS_PER_YEAR).toString(), currency };
}
