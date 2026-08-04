import {
  FeeKind,
  TransferRail,
  TransferStatus,
  type TransferDestination,
} from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { LimitScope } from '../products/index.js';

/**
 * The pure decisions a transfer needs before anything is written.
 *
 * Which rail carries a destination, which allowance it consumes, what it is priced as, and
 * whether it can still be cancelled. All four are answers about a *shape*, not about the
 * state of the world, so they belong in a function that a test can ask a hundred questions
 * of in a millisecond rather than in a service that needs a database to answer one.
 */

/** The rail a destination must travel on. Determined by the destination, never chosen. */
export function railFor(destination: TransferDestination): TransferRail {
  if (destination.kind === 'INTERNAL') return TransferRail.INTERNAL;
  if (destination.kind === 'DOMESTIC') return TransferRail.DOMESTIC_ACH;
  return TransferRail.INTERNATIONAL_SWIFT;
}

/** The product allowance a rail consumes. */
export function limitScopeFor(rail: TransferRail): LimitScope {
  if (rail === TransferRail.INTERNAL) return LimitScope.INTERNAL_TRANSFER;
  if (rail === TransferRail.INTERNATIONAL_SWIFT) return LimitScope.INTERNATIONAL_TRANSFER;
  return LimitScope.DOMESTIC_TRANSFER;
}

/**
 * The fee schedule entry a rail is priced against, or null when the catalogue has none.
 *
 * `FeeKind` has no `INTERNAL_TRANSFER` member, so an internal transfer cannot be priced by
 * the product catalogue at all and comes out free. That is the right *default* — moving
 * money between two accounts at the same bank costs the bank nothing — but it should be a
 * catalogue decision rather than a gap in an enum, so the member is proposed in
 * `docs/CONTRACT_CHANGES.md`. Until it exists, null means "not priced" and the pricing
 * path treats it exactly as it treats a product with no entry for the kind.
 */
export function feeKindFor(rail: TransferRail): FeeKind | null {
  if (rail === TransferRail.INTERNATIONAL_SWIFT) return FeeKind.INTERNATIONAL_TRANSFER;
  if (rail === TransferRail.INTERNAL) return null;
  return FeeKind.DOMESTIC_TRANSFER;
}

/**
 * Statuses a customer may still call off.
 *
 * An internal transfer is never one of them for a reason worth stating: it settles inside
 * the transaction that created it, so by the time a response exists the payee already has
 * the money. Offering a cancel button that could only ever fail would be a worse lie than
 * the honest `TRANSFER_NOT_CANCELLABLE`. Cancellation becomes real for the rails that
 * genuinely queue work — D-03's batch windows and D-06's future-dated orders.
 */
const CANCELLABLE_STATUSES: ReadonlySet<TransferStatus> = new Set([
  TransferStatus.DRAFT,
  TransferStatus.AWAITING_APPROVAL,
  TransferStatus.SCHEDULED,
  TransferStatus.PENDING,
]);

export function isCancellable(status: TransferStatus): boolean {
  return CANCELLABLE_STATUSES.has(status);
}

/** What the sender loses and what the payee gains, once the fee is placed. */
export interface TransferAmounts {
  readonly debitAmount: Money;
  readonly creditAmount: Money;
  readonly fee: Money;
}

/**
 * Splits the requested amount into a debit and a credit around the fee.
 *
 * `amountIsReceiveSide` is the customer's answer to "should they get exactly this, or
 * should exactly this leave my account?" — and getting it wrong by a fee is the classic
 * way an invoice ends up short. When the payee is to receive the full amount the fee is
 * added on top; otherwise it comes out of the amount and the payee receives less.
 */
export function splitAroundFee(input: {
  amount: Money;
  fee: Money;
  amountIsReceiveSide: boolean;
}): TransferAmounts {
  if (input.amountIsReceiveSide) {
    return {
      debitAmount: input.amount.plus(input.fee),
      creditAmount: input.amount,
      fee: input.fee,
    };
  }

  return {
    debitAmount: input.amount,
    creditAmount: input.amount.minus(input.fee),
    fee: input.fee,
  };
}
