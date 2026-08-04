import { type CurrencyCode, Money } from '@reliance/money';

import { fromStored } from '../../common/money/money.codec.js';

import { type AccountRecord } from './account.store.js';

/**
 * The one definition of what a customer can spend.
 *
 * ```
 * net                = ledgerBalance − holdTotal
 * available          = max(net + overdraftLimit, 0)
 * overdraftAvailable = min(overdraftLimit, available)
 * ```
 *
 * Three consequences worth stating, because each is a decision rather than an inevitability:
 *
 * 1. **Holds reduce availability without touching the ledger.** A card authorisation is a
 *    promise, not a movement; the money is unspendable but still booked to the customer
 *    until the merchant captures it.
 * 2. **The floor at zero.** An account pushed past its facility — by a fee, or by a
 *    facility being cut while it was in use — has a negative `net + limit`. Reporting a
 *    negative "available" would invite a caller to treat it as spendable headroom in the
 *    other direction; zero says the truth, which is that nothing can be spent.
 * 3. **`overdraftAvailable` is the unused facility**, which is why it is clamped by
 *    `available`: once the customer is 20 into a 50 facility, 30 of it remains, and both
 *    numbers say 30.
 *
 * A pure function of one account record, deliberately: it is used by the mapper that
 * renders a balance, by `BalanceService` before money moves, and by the closure guard,
 * and a rule enforced in three places has to be computed in one.
 */
export function computeAvailability(account: AccountRecord): AvailabilitySnapshot {
  const currency = account.currency as CurrencyCode;
  const ledger = fromStored(account.ledgerBalance);
  const held = fromStored(account.holdTotal);
  const overdraftLimit = fromStored(account.overdraftLimit);

  const net = ledger.minus(held);
  const available = atLeastZero(net.plus(overdraftLimit), currency);
  const overdraftAvailable = lesserOf(overdraftLimit, available);

  return { currency, ledger, held, net, overdraftLimit, overdraftAvailable, available };
}

/** Everything a spend decision or a rendered balance needs, in `Money`. */
export interface AvailabilitySnapshot {
  readonly currency: CurrencyCode;
  /** Booked balance: the sum of every posting. */
  readonly ledger: Money;
  /** Total of every `ACTIVE` hold. */
  readonly held: Money;
  /** `ledger − held`. The stored `availableBalance` mirrors this exactly. */
  readonly net: Money;
  /** The arranged facility in full, used or not. */
  readonly overdraftLimit: Money;
  /** The part of the facility still unused. */
  readonly overdraftAvailable: Money;
  /** What the customer may spend right now. Never negative. */
  readonly available: Money;
}

/** Whether `amount` can be spent from this account without breaching the facility. */
export function coversSpend(account: AccountRecord, amount: Money): boolean {
  return computeAvailability(account).available.greaterThanOrEqual(amount);
}

function atLeastZero(amount: Money, currency: CurrencyCode): Money {
  return amount.isNegative ? Money.zero(currency) : amount;
}

function lesserOf(left: Money, right: Money): Money {
  return left.lessThanOrEqual(right) ? left : right;
}
