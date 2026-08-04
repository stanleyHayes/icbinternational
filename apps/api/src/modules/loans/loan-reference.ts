/**
 * Ledger references for lending movements.
 *
 * A reference is the idempotency key the ledger enforces uniqueness on, so it has to be
 * derived from the event rather than generated fresh: a retried disbursement must produce
 * the same string, or the customer is funded twice. Everything in it is already known from
 * the record and the business date, which is what makes that possible.
 */

/** What kind of movement a reference describes. */
export const LoanMovement = {
  DISBURSEMENT: 'DISB',
  ARRANGEMENT_FEE: 'ARRF',
  REPAYMENT: 'RPY',
  LATE_FEE: 'LATE',
  ALLOWANCE: 'PROV',
  WRITE_OFF: 'WOFF',
} as const;
export type LoanMovement = (typeof LoanMovement)[keyof typeof LoanMovement];

const PREFIX = 'LOAN';
const SEPARATOR = '-';

/**
 * Builds a reference.
 *
 * @param loanId The loan or, before drawdown, the application the movement belongs to.
 * @param movement Which kind of movement this is.
 * @param discriminator What makes this instance of that movement unique — a business date,
 *   an instalment number. Two movements of the same kind on the same loan must never share
 *   one, or the second will be silently treated as a replay of the first.
 */
export function loanReference(
  loanId: string,
  movement: LoanMovement,
  discriminator: string,
): string {
  return [PREFIX, loanId, movement, discriminator].join(SEPARATOR);
}
