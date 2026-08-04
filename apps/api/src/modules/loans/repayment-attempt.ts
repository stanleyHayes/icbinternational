/**
 * The identity of one attempt to collect a repayment.
 *
 * A repayment's ledger reference used to be `LOAN-<loanId>-RPY-<date>.<count+1>`, every
 * part of which two concurrent repayments of *different* amounts read identically. The
 * ledger dedupes on reference and returns the entry it already holds, so the second
 * movement was never booked — while its write-down against the loan committed anyway. The
 * customer's balance fell by money the bank never received.
 *
 * An attempt id fixes that at the source, and it has to be an id rather than the amount:
 * paying the same figure twice in one day is ordinary customer behaviour, so an amount
 * would leave two legitimate repayments still colliding.
 *
 * It is minted once per request, before any transaction opens, which makes it stable
 * across every retry of *that* collection and different for any other. Stability is the
 * point: it is also written onto the loan, so a re-run of an interrupted transaction
 * recognises its own committed work instead of collecting a second time.
 *
 * Not a public identifier — it never reaches the wire, appearing only in a ledger
 * reference and an internal field — which is why it carries a local prefix rather than an
 * entry in the contract's `ID_PREFIX` table.
 */

import { monotonicFactory } from 'ulid';

/** Marks the id in a ledger reference as a repayment attempt, for anyone reading a log. */
const REPAYMENT_ATTEMPT_PREFIX = 'rpy';

/** Monotonic within a millisecond, so attempts minted together still sort in order. */
const nextUlid = monotonicFactory();

/** Mints the id one collection attempt is known by, in the ledger and on the loan. */
export function newRepaymentAttemptId(): string {
  return `${REPAYMENT_ATTEMPT_PREFIX}_${nextUlid()}`;
}
