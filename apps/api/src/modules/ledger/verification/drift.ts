import { Money } from '@reliance/money';

import { GL, findGlAccount } from '../../../domain/ledger/index.js';
import { toDebitCreditColumns } from '../balance-columns.js';

import {
  type DriftScope,
  type BalanceDrift,
  type ControlTotalCheck,
  type ReplayedBalance,
  type TrialBalanceCheck,
} from './verification.types.js';

/**
 * Turning a rebuilt balance and a stored one into a finding.
 *
 * Pure functions, kept apart from the service so the arithmetic that decides whether the
 * bank is sound can be tested without a database, a clock or a module graph.
 */

/**
 * Compares one rebuilt balance against what is stored.
 *
 * A missing stored record is reported rather than skipped: an account with postings but
 * no projection is drift of exactly the amount that was posted to it, and silently
 * treating "absent" as "zero and therefore fine" is how a hole stays open for years.
 */
export function diffBalance(input: {
  scope: DriftScope;
  replayed: ReplayedBalance;
  stored: Money | null;
}): BalanceDrift | null {
  const { replayed, stored } = input;

  if (stored && stored.equals(replayed.balance)) return null;

  const difference = (stored ?? Money.zero(replayed.balance.currency)).minus(replayed.balance);

  return {
    scope: input.scope,
    target: replayed.target,
    currency: replayed.currency,
    expected: replayed.balance.amount.toString(),
    actual: stored ? stored.amount.toString() : null,
    difference: difference.amount.toString(),
  };
}

/**
 * Trial balance derived from the replay, per currency.
 *
 * Sourced from the replay rather than from the stored projection on purpose: a trial
 * balance computed from the same numbers that might be wrong would balance happily while
 * the books were nonsense. This one balances only if every posting ever written does.
 */
export function trialBalanceFromReplay(
  ledgerBalances: readonly ReplayedBalance[],
): TrialBalanceCheck[] {
  const totals = new Map<string, { debits: Money; credits: Money }>();

  for (const replayed of ledgerBalances) {
    const type = findGlAccount(replayed.target)?.type;
    // A balance on a code that is not in the chart of accounts cannot be classified, and
    // is already reported as ledger-account drift — counting it here would double-report.
    if (!type) continue;

    const columns = toDebitCreditColumns({ type, balance: replayed.balance });
    const running = totals.get(replayed.currency) ?? zeroPair(replayed.currency);

    totals.set(replayed.currency, {
      debits: running.debits.plus(columns.debit),
      credits: running.credits.plus(columns.credit),
    });
  }

  return [...totals.entries()].map(([currency, { debits, credits }]) => ({
    currency,
    totalDebits: debits.amount.toString(),
    totalCredits: credits.amount.toString(),
    difference: debits.minus(credits).amount.toString(),
    balanced: debits.equals(credits),
  }));
}

/**
 * Checks `SUM(customer balances) === GL 2000 Customer Deposits`, per currency.
 *
 * Both sides come from the replay, so this proves the *postings* are internally
 * consistent — that no leg reached the control account without naming a customer. It is
 * the check that catches a bug the trial balance cannot see, because such an entry
 * balances perfectly while pointing at nobody.
 */
export function controlTotalsFromReplay(input: {
  ledgerBalances: readonly ReplayedBalance[];
  customerBalances: readonly ReplayedBalance[];
}): ControlTotalCheck[] {
  const customerTotals = sumByCurrency(input.customerBalances);
  const controlTotals = sumByCurrency(
    input.ledgerBalances.filter((balance) => balance.target === GL.CUSTOMER_DEPOSITS),
  );

  const currencies = new Set([...customerTotals.keys(), ...controlTotals.keys()]);

  return [...currencies].map((currency) => {
    const customers = customerTotals.get(currency) ?? Money.zero(asCurrency(currency));
    const control = controlTotals.get(currency) ?? Money.zero(asCurrency(currency));
    const difference = customers.minus(control);

    return {
      currency,
      customerDepositsTotal: customers.amount.toString(),
      controlAccountBalance: control.amount.toString(),
      difference: difference.amount.toString(),
      matched: difference.isZero,
    };
  });
}

function sumByCurrency(balances: readonly ReplayedBalance[]): Map<string, Money> {
  const totals = new Map<string, Money>();

  for (const entry of balances) {
    const running = totals.get(entry.currency);
    totals.set(entry.currency, running ? running.plus(entry.balance) : entry.balance);
  }

  return totals;
}

function zeroPair(currency: string): { debits: Money; credits: Money } {
  const zero = Money.zero(asCurrency(currency));
  return { debits: zero, credits: zero };
}

/**
 * Every currency reaching this module came out of a `Money`, so it is already valid.
 * `Money.zero` re-validates it anyway and throws if that ever stops being true.
 */
function asCurrency(currency: string): Parameters<typeof Money.zero>[0] {
  return currency as Parameters<typeof Money.zero>[0];
}
