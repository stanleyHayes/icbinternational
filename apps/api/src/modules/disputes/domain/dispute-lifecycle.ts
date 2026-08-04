/**
 * The dispute state machine, as pure facts.
 *
 * Nothing here knows about Nest, Mongo or the ledger — it answers questions about the
 * lifecycle so the services can decide what to do, and the unit tests can pin the rules
 * down without standing any infrastructure up.
 */

import { DisputeStatus } from '@reliance/contracts';
import { type Money } from '@reliance/money';

/** Statuses in which the case is still being worked. */
export const OPEN_STATUSES: readonly DisputeStatus[] = Object.freeze([
  DisputeStatus.SUBMITTED,
  DisputeStatus.UNDER_REVIEW,
  DisputeStatus.EVIDENCE_REQUESTED,
  DisputeStatus.REPRESENTED,
  DisputeStatus.ARBITRATION,
]);

/** Terminal statuses. A decided dispute never moves again. */
export const TERMINAL_STATUSES: readonly DisputeStatus[] = Object.freeze([
  DisputeStatus.WON,
  DisputeStatus.LOST,
  DisputeStatus.WITHDRAWN,
]);

/** Statuses in which the merchant's answer is still being waited for. */
export const AWAITING_MERCHANT_STATUSES: readonly DisputeStatus[] = Object.freeze([
  DisputeStatus.SUBMITTED,
  DisputeStatus.UNDER_REVIEW,
  DisputeStatus.EVIDENCE_REQUESTED,
]);

/** Whether the case can still change state. */
export function isOpenStatus(status: DisputeStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

/** Whether the merchant's response deadline applies to this status. */
export function awaitsMerchantResponse(status: DisputeStatus): boolean {
  return AWAITING_MERCHANT_STATUSES.includes(status);
}

/**
 * Whether the merchant's answer is due: the case awaits one and the simulated clock has
 * reached the response deadline. Lazy evaluation is deliberate — the simulator has no
 * job queue of its own, so the case advances when someone next looks at it.
 */
export function isMerchantResponseDue(input: {
  status: DisputeStatus;
  merchantResponseDueAt: Date;
  now: Date;
}): boolean {
  return awaitsMerchantResponse(input.status) && input.now >= input.merchantResponseDueAt;
}

/**
 * Whether the transaction is still inside the scheme's dispute window.
 *
 * @param bookedAt When the transaction was booked.
 * @param now The simulated "now".
 * @param windowDays The window length — {@link DISPUTE_WINDOW_DAYS} in production.
 */
export function isWithinDisputeWindow(bookedAt: Date, now: Date, windowDays: number): boolean {
  return now.getTime() - bookedAt.getTime() <= windowDays * MS_PER_DAY;
}

/**
 * A scheme deadline, `days` of simulated clock after `from`.
 *
 * Plain millisecond arithmetic rather than calendar arithmetic: the scheme counts elapsed
 * days, not business days, and advancing the simulated clock has to move every deadline
 * with it by exactly the amount it moved.
 */
export function deadlineFrom(from: Date, days: number): Date {
  return new Date(from.getTime() + days * MS_PER_DAY);
}

/**
 * Resolves how much of the transaction is being disputed.
 *
 * An omitted amount disputes the whole transaction; a partial amount must be positive
 * and no more than the original. Returns `null` for an invalid request — the caller
 * turns that into a `VALIDATION_FAILED` error with field detail, keeping this layer
 * free of HTTP vocabulary.
 */
export function resolveDisputedAmount(
  requested: Money | null,
  transactionAmount: Money,
): Money | null {
  const amount = requested ?? transactionAmount;
  if (!amount.isPositive) return null;
  if (amount.currency !== transactionAmount.currency) return null;
  if (amount.compare(transactionAmount) > 0) return null;
  return amount;
}

/**
 * Where a case goes when the customer answers a representment with further evidence:
 * the scheme's arbitration stage, the last stop before a final decision.
 */
export function statusAfterEvidenceOn(status: DisputeStatus): DisputeStatus {
  return status === DisputeStatus.REPRESENTED ? DisputeStatus.ARBITRATION : status;
}

const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
const MS_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND;
