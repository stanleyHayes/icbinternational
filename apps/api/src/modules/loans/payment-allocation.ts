/**
 * How a repayment is applied: fees, then interest, then principal.
 *
 * The order is a product decision with real money attached. Applying a partial payment to
 * principal first would shrink the balance faster and reduce the interest the bank earns;
 * applying it to fees first means a customer in difficulty clears charges before they make
 * any progress on the debt. The bank publishes fees → interest → principal in its credit
 * agreement, so that is what this file does, in one place, for every repayment path —
 * scheduled instalment, ad-hoc overpayment, arrears plan and sweep alike.
 */

import { Money } from '@reliance/money';

/** What is owed, split by the buckets a payment fills in order. */
export interface OutstandingAmounts {
  readonly fees: Money;
  readonly interest: Money;
  readonly principal: Money;
}

/** Where a payment went, and what could not be used. */
export interface PaymentAllocation {
  readonly toFees: Money;
  readonly toInterest: Money;
  readonly toPrincipal: Money;
  /**
   * The part of the payment that exceeded everything owed.
   *
   * Not silently absorbed: an overpayment past settlement is the customer's money and has
   * to be returned to their account, so the caller is handed the figure explicitly.
   */
  readonly unallocated: Money;
}

/**
 * Fills the fee, interest and principal buckets in order from `payment`.
 *
 * Pure and total: any payment, including one larger than the debt or smaller than the
 * fees, produces an allocation whose four parts sum exactly back to `payment`.
 *
 * @throws {import('@reliance/money').CurrencyMismatchError} if the buckets and the payment
 *   are not all in the same currency.
 */
export function allocatePayment(
  payment: Money,
  outstanding: OutstandingAmounts,
): PaymentAllocation {
  const afterFees = take(payment, outstanding.fees);
  const afterInterest = take(afterFees.left, outstanding.interest);
  const afterPrincipal = take(afterInterest.left, outstanding.principal);

  return {
    toFees: afterFees.taken,
    toInterest: afterInterest.taken,
    toPrincipal: afterPrincipal.taken,
    unallocated: afterPrincipal.left,
  };
}

/** Total actually applied to the debt, excluding anything left over. */
export function allocatedTotal(allocation: PaymentAllocation): Money {
  return allocation.toFees.plus(allocation.toInterest).plus(allocation.toPrincipal);
}

function take(available: Money, owed: Money): { taken: Money; left: Money } {
  const zero = Money.zero(available.currency);
  if (!available.isPositive || !owed.isPositive) return { taken: zero, left: available };

  const taken = available.lessThan(owed) ? available : owed;
  return { taken, left: available.minus(taken) };
}
