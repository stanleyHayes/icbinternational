import { BillerRejection } from './biller-rail.types.js';
import {
  BPS_SCALE,
  FNV_OFFSET_BASIS,
  FNV_PRIME,
  LATENCY_SPREAD_MS,
  MIN_LATENCY_MS,
  RECEIPT_ALPHABET,
  RECEIPT_LENGTH,
  RECEIPT_PREFIX,
  TIMEOUT_LATENCY_MS,
} from './biller.constants.js';

/**
 * How the simulated network decides, and why it decides the same way twice.
 *
 * Every decision is a pure function of the submission's identity — no clock, no global
 * PRNG, no hidden state. Feed the same payment id and attempt number in and the same
 * answer comes out, which is what makes a failing bill payment reproducible from its id
 * alone. It is also what lets the reversal test assert on a specific payment rather than
 * looping until the coin lands the right way up.
 *
 * A *retry* is deliberately a different draw: the attempt number is part of the hashed
 * key, so a payment that timed out once is not condemned to time out forever. That is the
 * behaviour a real rail has, and modelling it is the difference between a retry policy
 * that helps and one that only burns the budget.
 */

/** Deterministic 32-bit FNV-1a hash. Not a security primitive — a stable spreader. */
export function stableHash(value: string): number {
  let hash = FNV_OFFSET_BASIS;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.codePointAt(index) ?? 0;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }

  return hash >>> 0;
}

/** A hash of `key`, projected into `[0, buckets)`. The rail's only source of chance. */
export function bucketOf(key: string, buckets: number): number {
  return stableHash(key) % buckets;
}

/** The draw a submission gets, in basis points of `[0, 10000)`. */
export function drawBps(key: string): number {
  return bucketOf(key, BPS_SCALE);
}

/** The identity a decision is keyed on. Retries hash differently — see the module docs. */
export function decisionKey(input: {
  paymentId: string;
  reference: string;
  attempt: number;
}): string {
  return `${input.paymentId}:${input.reference}:${input.attempt}`;
}

/**
 * Refusals the network can return, ordered so the common ones are drawn more often.
 *
 * Repeating an entry is a weighting, not a mistake: an unknown account reference is the
 * overwhelmingly common real-world rejection and a biller-side system error is rare, so
 * the table reflects that rather than treating all five as equally likely.
 */
const REJECTION_TABLE: readonly BillerRejection[] = Object.freeze([
  BillerRejection.UNKNOWN_ACCOUNT,
  BillerRejection.UNKNOWN_ACCOUNT,
  BillerRejection.UNKNOWN_ACCOUNT,
  BillerRejection.ACCOUNT_CLOSED,
  BillerRejection.ACCOUNT_CLOSED,
  BillerRejection.AMOUNT_NOT_ACCEPTED,
  BillerRejection.DUPLICATE_SUSPECTED,
  BillerRejection.BILLER_SYSTEM_ERROR,
]);

/** Which refusal a rejected submission receives. */
export function rejectionFor(key: string): BillerRejection {
  return (
    REJECTION_TABLE[bucketOf(`reject:${key}`, REJECTION_TABLE.length)] ??
    BillerRejection.BILLER_SYSTEM_ERROR
  );
}

/** How long the network took. Timeouts report the full window, not a plausible-looking wait. */
export function latencyFor(key: string, timedOut: boolean): number {
  if (timedOut) return TIMEOUT_LATENCY_MS;
  return MIN_LATENCY_MS + bucketOf(`latency:${key}`, LATENCY_SPREAD_MS);
}

/**
 * The receipt token the biller issues on acceptance.
 *
 * Derived from the payment id so that a customer quoting their receipt back to support
 * can be matched to the payment without a lookup table, and so that a replayed submission
 * cannot produce two different receipts for one debit.
 */
export function receiptFor(paymentId: string): string {
  let hash = stableHash(`receipt:${paymentId}`);
  let token = '';

  for (let index = 0; index < RECEIPT_LENGTH; index += 1) {
    token += RECEIPT_ALPHABET[hash % RECEIPT_ALPHABET.length];
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }

  return `${RECEIPT_PREFIX}${token}`;
}
