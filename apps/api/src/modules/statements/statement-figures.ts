/**
 * The five numbers on a statement, and the identity that has to hold between them.
 *
 * Opening and closing balances are **read off** the ledger's own running balance, never
 * accumulated from the rows in between. `runningBalance` was written by the projector
 * inside the posting transaction from the account's real balance at that instant, so it
 * is a recorded fact; a total built by adding up the period would drift the moment
 * anything reached the balance by a path this range does not see.
 *
 * The totals in and out are then checked against those two recorded balances. A statement
 * whose arithmetic does not close is not a statement with a rounding problem — it means
 * the range is missing a posting, and issuing it would hand the customer a document that
 * fails the first check anybody performs on one.
 */

import { ErrorCode, TransactionDirection } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { AppError } from '../../common/errors/app-error.js';
import { fromStored } from '../../common/money/money.codec.js';
import { type TransactionRecord } from '../transactions/repositories/transaction.store.js';

/** What a period summary reports, before it is shaped for the wire. */
export interface StatementFigures {
  readonly opening: Money;
  readonly closing: Money;
  readonly credits: Money;
  readonly debits: Money;
  readonly count: number;
}

/**
 * Summarises one period.
 *
 * @throws {AppError} `INTERNAL_ERROR` when the period does not reconcile.
 */
export function summarise(input: {
  records: readonly TransactionRecord[];
  opening: Money;
  label: string;
}): StatementFigures {
  const currency = input.opening.currency;
  let credits = Money.zero(currency);
  let debits = Money.zero(currency);

  for (const record of input.records) {
    const amount = fromStored(record.amount);
    if (record.direction === TransactionDirection.CREDIT) credits = credits.plus(amount);
    else debits = debits.plus(amount);
  }

  const last = input.records.at(-1);
  const closing = last ? fromStored(last.runningBalance) : input.opening;
  const figures = { opening: input.opening, closing, credits, debits, count: input.records.length };

  assertReconciles(figures, input.label);
  return figures;
}

/** The one check that makes a closing balance worth printing. */
function assertReconciles(figures: StatementFigures, label: string): void {
  const derived = figures.opening.plus(figures.credits).minus(figures.debits);
  if (derived.amount === figures.closing.amount) return;

  throw new AppError({
    code: ErrorCode.INTERNAL_ERROR,
    message: 'We could not produce that statement. Our team has been notified.',
    context: {
      period: label,
      opening: figures.opening.toJSON(),
      closing: figures.closing.toJSON(),
      derived: derived.toJSON(),
      transactions: figures.count,
    },
  });
}
