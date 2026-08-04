/**
 * Types the deposits module owns, and the contract types it re-exports.
 *
 * One import for a consumer, and one place to look when the contract and the module
 * disagree about what a deposit is.
 */

export {
  DepositStatus,
  type BreakDepositQuote,
  type CreateDepositRequest,
  type Deposit,
  type DepositRate,
} from '@reliance/contracts';

/** Prefix on every ledger reference the deposits book writes. */
export const DEPOSIT_REFERENCE_PREFIX = 'DEP';

/**
 * Transaction labels, so a retry log names the operation that produced the conflict.
 *
 * Every one of these covers a deposit record *and* a ledger posting. They are named
 * because `TransactionRunner` puts the label in its retry warning, and "transaction"
 * appearing four times in a log tells an operator nothing about which product moved.
 */
export const DEPOSIT_TRANSACTION_LABEL = {
  PLACE: 'deposit.place',
  BREAK: 'deposit.break',
  MATURE: 'deposit.mature',
} as const;

/** What kind of movement a deposit reference describes. */
export const DepositMovement = {
  PLACEMENT: 'PLACE',
  MATURITY: 'MAT',
  BREAK: 'BRK',
  ROLLOVER: 'ROLL',
} as const;
export type DepositMovement = (typeof DepositMovement)[keyof typeof DepositMovement];

/**
 * Builds a deposit's ledger reference.
 *
 * Derived from the deposit and the business date rather than generated, so a retried
 * maturity run books nothing new — the ledger's unique index on `reference` turns the
 * second attempt into a no-op.
 */
export function depositReference(
  depositId: string,
  movement: DepositMovement,
  asOf: string,
): string {
  return [DEPOSIT_REFERENCE_PREFIX, depositId, movement, asOf].join('-');
}
