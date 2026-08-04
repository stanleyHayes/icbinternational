import { type LedgerAccountType, type TrialBalance } from '@reliance/contracts';
import { Money, type CurrencyCode } from '@reliance/money';

import { debitIncreases } from '../../domain/ledger/chart-of-accounts.js';

import { type GlAccountTotals } from './gl-totals.repository.js';

/** One chart row as the builder needs it — no persistence type leaks into the report. */
export interface TrialBalanceAccount {
  readonly code: string;
  readonly name: string;
  readonly type: LedgerAccountType;
}

/** Everything the builder needs, already fetched. */
export interface TrialBalanceInput {
  readonly currency: CurrencyCode;
  readonly asOf: Date;
  readonly accounts: readonly TrialBalanceAccount[];
  readonly totals: readonly GlAccountTotals[];
}

/**
 * Assembles the trial balance report from gross per-account movement.
 *
 * Pure and framework-free so the arithmetic can be tested exhaustively without a
 * database. The report lists every active account — including ones with no movement,
 * because an auditor reads a missing row as a missing account, not as a zero — and the
 * whole-book totals must agree: when they do not, `balanced` says so and the bank stops
 * (see the domain glossary, "Trial balance").
 */
export function buildTrialBalance(input: TrialBalanceInput): TrialBalance {
  const totalsByCode = new Map(input.totals.map((row) => [row.code, row]));

  let totalDebits = Money.zero(input.currency);
  let totalCredits = Money.zero(input.currency);

  const lines = input.accounts.map((account) => {
    const totals = totalsByCode.get(account.code);
    const debit = minor(totals?.debits, input.currency);
    const credit = minor(totals?.credits, input.currency);

    totalDebits = totalDebits.plus(debit);
    totalCredits = totalCredits.plus(credit);

    return {
      code: account.code,
      name: account.name,
      type: account.type,
      debit: debit.toJSON(),
      credit: credit.toJSON(),
    };
  });

  const difference = totalDebits.minus(totalCredits);

  return {
    currency: input.currency,
    asOf: input.asOf.toISOString(),
    lines,
    totalDebits: totalDebits.toJSON(),
    totalCredits: totalCredits.toJSON(),
    difference: difference.toJSON(),
    balanced: difference.isZero,
  };
}

/**
 * The signed net balance of an account from its gross movement, honouring its normal side.
 *
 * Assets and expenses are debit-normal; liabilities, equity and income are credit-normal
 * (`debitIncreases` is the one place that rule lives). The result is what the chart
 * list reports as the account's `balance` — a projection, never a stored figure.
 */
export function netBalance(
  type: LedgerAccountType,
  totals: GlAccountTotals | undefined,
  currency: CurrencyCode,
): Money {
  const debits = minor(totals?.debits, currency);
  const credits = minor(totals?.credits, currency);
  return debitIncreases(type) ? debits.minus(credits) : credits.minus(debits);
}

function minor(amount: string | undefined, currency: CurrencyCode): Money {
  return amount === undefined ? Money.zero(currency) : Money.fromMinor(amount, currency);
}
