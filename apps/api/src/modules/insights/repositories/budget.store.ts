import { type SpendCategory } from '@reliance/contracts';

import { type StoredMoney } from '../../../common/money/money.codec.js';

/**
 * What the budget service is allowed to know about persistence.
 *
 * An abstract class so Nest can use it as both an injection token and a type, and so the
 * budget tests can run against an in-memory implementation that enforces the same
 * uniqueness rule the database does.
 */
export abstract class BudgetStore {
  /** Every budget the customer has set, in a stable order. */
  abstract listByUser(userId: string): Promise<BudgetRecord[]>;

  abstract findByPublicId(id: string): Promise<BudgetRecord | null>;

  /**
   * Creates the budget for this category, or replaces the limit if one exists.
   *
   * A single atomic upsert rather than a read-then-write, because `(userId, category)` is
   * a unique index and two rapid saves would otherwise race into a duplicate-key error
   * the customer has done nothing to deserve.
   */
  abstract upsert(input: UpsertBudget): Promise<BudgetRecord>;

  /** Removes a budget. Returns false when there was nothing of the customer's to remove. */
  abstract remove(id: string, userId: string): Promise<boolean>;
}

export interface BudgetRecord {
  readonly id: string;
  readonly userId: string;
  readonly category: SpendCategory;
  readonly limit: StoredMoney;
  readonly alertAtBps: number;
}

export interface UpsertBudget {
  readonly userId: string;
  readonly category: SpendCategory;
  readonly limit: StoredMoney;
  readonly alertAtBps: number;
}
