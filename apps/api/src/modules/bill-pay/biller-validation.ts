import { ErrorCode, type Biller } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { AppError } from '../../common/errors/app-error.js';
import { fromStored } from '../../common/money/money.codec.js';

import { MAX_CUSTOMER_REFERENCE } from './bill-pay.constants.js';

/**
 * Everything the bank can check before it talks to anybody.
 *
 * Each biller publishes the shape of its own account numbers, and checking that shape
 * locally is not busywork: a mistyped reference caught here costs the customer a moment,
 * and the same reference caught by the biller three days later costs them a missed bill and
 * a late fee. A validation rule that never rejects anything is not a validation rule.
 *
 * The pattern comes from the directory as a string and is compiled per call rather than
 * cached. These are seeded, bank-authored expressions over short inputs, so there is no
 * untrusted regex here — but the input length is bounded anyway, because "the directory is
 * trusted" is an assumption and bounding it is a fact.
 */

/** Refuses a reference the biller's own format would reject. */
export function assertReferenceMatches(biller: Biller, reference: string): void {
  const trimmed = reference.trim();

  if (trimmed.length === 0 || trimmed.length > MAX_CUSTOMER_REFERENCE) {
    throw referenceRejected(biller, trimmed);
  }

  if (!new RegExp(biller.accountNumberPattern, 'u').test(trimmed)) {
    throw referenceRejected(biller, trimmed);
  }
}

/** Refuses an amount outside what the biller will take, or in the wrong currency. */
export function assertAmountAccepted(biller: Biller, amount: Money): void {
  const minimum = fromStored(biller.minAmount);
  const maximum = fromStored(biller.maxAmount);

  if (amount.currency !== minimum.currency) {
    throw new AppError({
      code: ErrorCode.CURRENCY_MISMATCH,
      message: `${biller.name} only accepts payments in ${minimum.currency}.`,
      context: { billerId: biller.id, expected: minimum.currency, received: amount.currency },
    });
  }

  if (amount.lessThan(minimum)) {
    throw new AppError({
      code: ErrorCode.AMOUNT_BELOW_MINIMUM,
      message: `${biller.name} does not accept payments below ${minimum.format()}.`,
      context: { billerId: biller.id, minimum: minimum.toString() },
    });
  }

  if (amount.greaterThan(maximum)) {
    throw new AppError({
      code: ErrorCode.AMOUNT_ABOVE_MAXIMUM,
      message: `${biller.name} does not accept payments above ${maximum.format()} in one go.`,
      context: { billerId: biller.id, maximum: maximum.toString() },
    });
  }
}

/** Refuses a biller the bank has withdrawn from the directory. */
export function assertBillerActive(biller: Biller): void {
  if (biller.active) return;

  throw new AppError({
    code: ErrorCode.PRECONDITION_FAILED,
    message: `We are no longer able to send payments to ${biller.name}.`,
    context: { billerId: biller.id },
  });
}

/**
 * The single "that reference is not right" rejection.
 *
 * It names the label the biller uses — "Customer reference", "Policy number" — because a
 * customer staring at a bill needs to know which box to look in, and "invalid input" tells
 * them nothing at all.
 */
function referenceRejected(biller: Biller, reference: string): AppError {
  return new AppError({
    code: ErrorCode.INVALID_ACCOUNT_NUMBER,
    message: `That does not look like a ${biller.name} ${biller.accountNumberLabel.toLowerCase()}. Check the number on your bill and try again.`,
    details: [{ path: 'customerReference', message: `must match the format ${biller.name} uses` }],
    context: { billerId: biller.id, length: reference.length },
  });
}
