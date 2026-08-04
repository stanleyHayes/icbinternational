/**
 * Round-ups: turning the change from card spend into savings.
 *
 * Pure, and deliberately simple. The rule a customer is told is "we round each purchase up
 * to the nearest pound and move the difference into your goal", and this is exactly that,
 * with two guards: a purchase that is already a round figure moves nothing, and no single
 * round-up can exceed the multiple.
 */

import { Money } from '@reliance/money';

import { MAX_ROUND_UP_MINOR_UNITS, ROUND_UP_MULTIPLE_MINOR_UNITS } from './goal.constants.js';

/**
 * The change from one card purchase.
 *
 * @param spend The purchase amount, positive. A refund rounds up to nothing — taking money
 *   out of a customer's account because they were given some back is indefensible.
 * @returns Zero when the purchase is already a whole multiple, so a customer who buys a
 *   £3.00 coffee is not charged another pound for the privilege.
 */
export function roundUpFor(spend: Money): Money {
  const zero = Money.zero(spend.currency);
  if (!spend.isPositive) return zero;

  const remainder = spend.amount % ROUND_UP_MULTIPLE_MINOR_UNITS;
  if (remainder === 0n) return zero;

  const change = ROUND_UP_MULTIPLE_MINOR_UNITS - remainder;
  return Money.fromMinor(min(change, MAX_ROUND_UP_MINOR_UNITS), spend.currency);
}

/**
 * The total change from a batch of purchases.
 *
 * Summed per purchase rather than computed on the total, because that is what the customer
 * is told happens and the two give different answers: three £1.50 purchases round up to
 * £1.50 of savings, while their £4.50 total would round up to fifty pence.
 */
export function roundUpTotal(spends: readonly Money[], currency: Money['currency']): Money {
  return spends.reduce((total, spend) => total.plus(roundUpFor(spend)), Money.zero(currency));
}

function min(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}
