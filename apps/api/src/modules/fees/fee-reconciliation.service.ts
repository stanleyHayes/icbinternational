import { Injectable } from '@nestjs/common';

import { FeeChargeStore, type CurrencyTotal } from './fee-charge.store.js';
import { FeeIncomeReader } from './fee-income.reader.js';

/** One currency's reconciliation between the journal and the charge records. */
export interface FeeReconciliationLine {
  readonly currency: string;
  /** Signed fee income booked to GL 4000 under this module's references, minor units. */
  readonly glIncomeMinor: bigint;
  /** Sum of this module's charge records, minor units. */
  readonly chargedMinor: bigint;
  /** `glIncomeMinor − chargedMinor`; zero when the books agree. */
  readonly differenceMinor: bigint;
  readonly balanced: boolean;
}

/** The full report: one line per currency seen on either side. */
export interface FeeReconciliationReport {
  readonly lines: readonly FeeReconciliationLine[];
  /** True only when every currency agrees to the minor unit. */
  readonly balanced: boolean;
}

/**
 * Proves the module's defining invariant: fee income in the GL equals the sum of the
 * fee charges, to the minor unit.
 *
 * Both sides are read independently — the journal through its own read window, the
 * charges from this module's collection — so a bug that dropped or double-counted on
 * either side shows up as a non-zero difference rather than cancelling out.
 */
@Injectable()
export class FeeReconciliationService {
  constructor(
    private readonly income: FeeIncomeReader,
    private readonly charges: FeeChargeStore,
  ) {}

  /** Compares GL fee income against recorded charges, per currency. */
  async reconcile(): Promise<FeeReconciliationReport> {
    const [glTotals, chargeTotals] = await Promise.all([
      this.income.feeIncomeTotals(),
      this.charges.totalsByCurrency(),
    ]);

    const lines = mergeLines(glTotals, chargeTotals);
    return { lines, balanced: lines.every((line) => line.balanced) };
  }
}

/** Joins the two per-currency totals into reconciliation lines. */
function mergeLines(
  glTotals: readonly CurrencyTotal[],
  chargeTotals: readonly CurrencyTotal[],
): FeeReconciliationLine[] {
  const glByCurrency = new Map(glTotals.map((total) => [total.currency, total.totalMinor]));
  const chargeByCurrency = new Map(chargeTotals.map((total) => [total.currency, total.totalMinor]));

  return [...new Set([...glByCurrency.keys(), ...chargeByCurrency.keys()])].map((currency) => {
    const glIncomeMinor = glByCurrency.get(currency) ?? 0n;
    const chargedMinor = chargeByCurrency.get(currency) ?? 0n;
    const differenceMinor = glIncomeMinor - chargedMinor;

    return {
      currency,
      glIncomeMinor,
      chargedMinor,
      differenceMinor,
      balanced: differenceMinor === 0n,
    };
  });
}
