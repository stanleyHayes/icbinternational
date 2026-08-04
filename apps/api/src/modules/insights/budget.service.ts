import { Injectable } from '@nestjs/common';

import {
  ErrorCode,
  type Budget,
  type SpendCategory,
  type UpsertBudgetRequest,
} from '@reliance/contracts';
import { Money, isCurrencyCode, type CurrencyCode } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { toIsoInstant } from '../transactions/transaction.presenter.js';

import { utilisationInBasisPoints } from './basis-points.js';
import { currentMonth } from './budget-period.js';
import { BudgetStore, type BudgetRecord } from './repositories/budget.store.js';
import { SpendService } from './spend.service.js';

/** Identifies a budget and the customer claiming it. */
export interface OwnedBudgetRef {
  readonly userId: string;
  readonly budgetId: string;
}

/**
 * Customer budgets and how much of each is left.
 *
 * A budget stores only its limit. `spent` is recomputed on every read from
 * `SpendService`, which reads the same rows the transaction list does — so a customer who
 * checks their dining budget against their dining transactions gets the same number.
 * A persisted counter would be faster and would be wrong within a week: it has to be
 * updated on every posting, on every reversal, and on every recategorisation, and the
 * first one that is missed is a discrepancy nobody can explain.
 *
 * The period is always the current calendar month on the simulated clock. Budgets are a
 * standing intention rather than a document per month, which is also why advancing the
 * simulator into February does not leave a customer's January budgets behind.
 */
@Injectable()
export class BudgetService {
  constructor(
    private readonly budgets: BudgetStore,
    private readonly spend: SpendService,
    private readonly clock: ClockService,
  ) {}

  /** Every budget the customer has set, with this month's utilisation. */
  async list(userId: string): Promise<Budget[]> {
    const records = await this.budgets.listByUser(userId);
    if (records.length === 0) return [];

    return this.withUtilisation(userId, records);
  }

  /** Creates the budget for a category, or updates the limit if one already exists. */
  async upsert(userId: string, request: UpsertBudgetRequest): Promise<Budget> {
    const currency = assertCurrency(request.limit.currency);

    const record = await this.budgets.upsert({
      userId,
      category: request.category,
      limit: { amount: request.limit.amount, currency },
      alertAtBps: request.alertAtBps,
    });

    const [budget] = await this.withUtilisation(userId, [record]);
    if (!budget) throw AppError.notFound('Budget', record.id);
    return budget;
  }

  /** Removes a budget. A budget belonging to someone else answers 404, never 403. */
  async remove(reference: OwnedBudgetRef): Promise<void> {
    const removed = await this.budgets.remove(reference.budgetId, reference.userId);
    if (!removed) throw AppError.notFound('Budget', reference.budgetId);
  }

  /**
   * Attaches this month's spend to each budget.
   *
   * Totals are fetched once per distinct currency rather than once per budget: a customer
   * with eight sterling budgets would otherwise trigger eight scans of the same month, and
   * the eight could disagree if a posting landed between them — leaving two budgets on one
   * screen that cannot both be right.
   */
  private async withUtilisation(
    userId: string,
    records: readonly BudgetRecord[],
  ): Promise<Budget[]> {
    const period = currentMonth(this.clock.now());
    const currencies = [...new Set(records.map((record) => assertCurrency(record.limit.currency)))];
    const spentBy = new Map<CurrencyCode, Map<SpendCategory, bigint>>();

    for (const currency of currencies) {
      const totals = await this.spend.totalsFor({ userId, currency }, period);
      spentBy.set(currency, new Map(totals.map((total) => [total.category, total.minorUnits])));
    }

    return records.map((record) => {
      const currency = assertCurrency(record.limit.currency);
      return toBudget({
        record,
        spent: spentBy.get(currency)?.get(record.category) ?? 0n,
        currency,
        period,
      });
    });
  }
}

function toBudget(input: {
  record: BudgetRecord;
  spent: bigint;
  currency: CurrencyCode;
  period: { from: Date; to: Date };
}): Budget {
  const limit = Money.fromMinor(input.record.limit.amount, input.currency);
  const spent = Money.fromMinor(input.spent, input.currency);

  return {
    id: input.record.id,
    category: input.record.category,
    limit: limit.toJSON(),
    spent: spent.toJSON(),
    // Negative once overspent, deliberately. Clamping to zero hides the one fact the
    // customer most needs from this screen.
    remaining: limit.minus(spent).toJSON(),
    utilisationBps: utilisationInBasisPoints(input.spent, BigInt(input.record.limit.amount)),
    periodStart: toIsoInstant(input.period.from),
    periodEnd: toIsoInstant(input.period.to),
    alertAtBps: input.record.alertAtBps,
  };
}

/**
 * Narrows a stored currency string to a `CurrencyCode`.
 *
 * The contract types a budget's currency as a `CurrencyCode` and storage keeps a bare
 * string; this is where the assumption becomes a check rather than a cast.
 */
function assertCurrency(currency: string): CurrencyCode {
  if (!isCurrencyCode(currency)) {
    throw new AppError({
      code: ErrorCode.CURRENCY_MISMATCH,
      message: `${currency || 'An empty currency'} is not a currency this bank holds.`,
    });
  }
  return currency;
}
