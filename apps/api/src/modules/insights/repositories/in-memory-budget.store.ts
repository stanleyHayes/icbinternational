import { BudgetIdGenerator } from '../budget-id.js';

import { BudgetStore, type BudgetRecord, type UpsertBudget } from './budget.store.js';

/**
 * An in-memory {@link BudgetStore} enforcing the same uniqueness rule as MongoDB.
 *
 * One budget per customer per category, and an upsert that keeps the existing id — the
 * two properties a budget test could otherwise pass without, and the two that matter when
 * a customer adjusts a limit twice in quick succession.
 */
export class InMemoryBudgetStore extends BudgetStore {
  private readonly budgets = new Map<string, BudgetRecord>();

  constructor(private readonly ids: BudgetIdGenerator = new BudgetIdGenerator()) {
    super();
  }

  override async listByUser(userId: string): Promise<BudgetRecord[]> {
    return [...this.budgets.values()]
      .filter((budget) => budget.userId === userId)
      .sort((left, right) => left.category.localeCompare(right.category));
  }

  override async findByPublicId(id: string): Promise<BudgetRecord | null> {
    return this.budgets.get(id) ?? null;
  }

  override async upsert(input: UpsertBudget): Promise<BudgetRecord> {
    const existing = [...this.budgets.values()].find(
      (budget) => budget.userId === input.userId && budget.category === input.category,
    );

    const record: BudgetRecord = {
      id: existing?.id ?? this.ids.generate(),
      userId: input.userId,
      category: input.category,
      limit: input.limit,
      alertAtBps: input.alertAtBps,
    };
    this.budgets.set(record.id, record);
    return record;
  }

  override async remove(id: string, userId: string): Promise<boolean> {
    const existing = this.budgets.get(id);
    if (!existing || existing.userId !== userId) return false;
    return this.budgets.delete(id);
  }

  /** Empties the store. Cheaper than rebuilding the module between tests. */
  reset(): void {
    this.budgets.clear();
  }
}
