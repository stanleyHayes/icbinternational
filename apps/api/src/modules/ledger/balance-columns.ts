import { type LedgerAccountType } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { debitIncreases } from '../../domain/ledger/index.js';

/**
 * Places a signed balance in the debit or the credit column of a trial balance.
 *
 * Balances are stored signed relative to the account's *normal* side — positive means
 * "more of whatever this account is for". A trial balance is presented the other way,
 * with two unsigned columns, because the whole point of the report is that the two
 * columns must total the same figure; a signed presentation would make the check
 * disappear into arithmetic nobody eyeballs.
 *
 * An account sitting on the wrong side of zero (a negative asset, an overdrawn deposit)
 * lands in the opposite column with its magnitude. That is correct accounting, not a
 * special case: a bank account in overdraft genuinely is an asset of the bank.
 */
export function toDebitCreditColumns(input: {
  type: LedgerAccountType;
  balance: Money;
}): DebitCreditColumns {
  const magnitude = input.balance.abs();
  const zero = Money.zero(input.balance.currency);

  const onNormalSide = !input.balance.isNegative;
  const showAsDebit = debitIncreases(input.type) === onNormalSide;

  return showAsDebit ? { debit: magnitude, credit: zero } : { debit: zero, credit: magnitude };
}

export interface DebitCreditColumns {
  readonly debit: Money;
  readonly credit: Money;
}
