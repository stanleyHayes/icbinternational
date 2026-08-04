import { Injectable } from '@nestjs/common';
import { monotonicFactory } from 'ulid';

/**
 * Public identifiers for budgets.
 *
 * `IdGenerator` mints from `ID_PREFIX` in the frozen contract, and that table has no
 * `budget` entry — `budgetSchema.id` is a bare `z.string()`, which is the contract
 * admitting the same gap. Rather than borrow a prefix that means something else (a budget
 * is not a goal) or emit a bare ULID and lose the property that makes a stray id in a log
 * self-describing, this mints `bdg_` locally in the same format.
 *
 * A proposal to add `ID_PREFIX.budget` and tighten `budgetSchema.id` to `entityId('bdg')`
 * is logged in `docs/CONTRACT_CHANGES.md`. When it lands, delete this file and inject
 * `IdGenerator` instead — the stored ids need no migration, because they already have
 * exactly the shape the contract will then require.
 */
@Injectable()
export class BudgetIdGenerator {
  /** Monotonic within a millisecond, so two ids minted together still sort in order. */
  private readonly ulid = monotonicFactory();

  /** A new `bdg_`-prefixed ULID. */
  generate(): string {
    return `${BUDGET_ID_PREFIX}_${this.ulid()}`;
  }
}

/** Kept exported so a test can assert the prefix without restating the literal. */
export const BUDGET_ID_PREFIX = 'bdg';
