/**
 * An honest, in-memory `GoalStore`.
 *
 * {@link listRoundUpTargets} enforces the rule that only open goals with round-ups
 * switched on receive them, and returns them oldest first, which is the order the
 * round-up rule depends on. A fake that returned every goal would let the round-up tests
 * pass while production quietly funded a closed goal.
 */

import { Injectable } from '@nestjs/common';

import { IdGenerator } from '../../common/ids/id-generator.js';

import {
  GoalStore,
  type AutoSaveQuery,
  type GoalPatchFields,
  type GoalQuery,
  type GoalRecord,
  pickPatchFields,
  type NewGoal,
  type VaultWriteInput,
} from './goal.store.js';

@Injectable()
export class InMemoryGoalStore extends GoalStore {
  private readonly byId = new Map<string, GoalRecord>();

  constructor(private readonly ids: IdGenerator) {
    super();
  }

  override async insert(goal: NewGoal): Promise<GoalRecord> {
    const record: GoalRecord = { ...goal, id: this.ids.generate('goal') };
    this.byId.set(record.id, record);
    return record;
  }

  override async findById(id: string): Promise<GoalRecord | null> {
    return this.byId.get(id) ?? null;
  }

  override async list(query: GoalQuery): Promise<GoalRecord[]> {
    return [...this.byId.values()]
      .filter((goal) => (query.userId ? goal.userId === query.userId : true))
      .filter((goal) => (query.openOnly ? goal.closedAt === null : true))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  }

  override async listRoundUpTargets(accountId: string): Promise<GoalRecord[]> {
    return this.open()
      .filter((goal) => goal.linkedAccountId === accountId && goal.roundUpsEnabled)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }

  override async patch(id: string, fields: GoalPatchFields): Promise<GoalRecord | null> {
    const current = this.byId.get(id);
    if (!current) return null;

    const updated: GoalRecord = { ...current, ...(pickPatchFields(fields) as Partial<GoalRecord>) };
    this.byId.set(id, updated);
    return updated;
  }

  /**
   * The same conditional write the Mongo store performs, enforced just as strictly.
   *
   * A fake that wrote the balance unconditionally would let every vault test pass while
   * production lost a concurrent contribution, so the condition is reproduced here rather
   * than assumed. Node's single thread does not make it redundant: two vault movements
   * interleave freely across their `await`s, and the second one's expectation is stale by
   * the time it arrives.
   */
  override async applyVaultMovement(write: VaultWriteInput): Promise<GoalRecord | null> {
    const current = this.byId.get(write.goalId);
    // Undefined fails this too: a goal that is gone can no longer satisfy any condition.
    if (current?.closedAt !== null) return null;
    if (current.movementCount !== write.expectedMovementCount) return null;
    if (current.currentAmount.amount !== write.expected.amount) return null;
    if (current.currentAmount.currency !== write.expected.currency) return null;

    const updated: GoalRecord = {
      ...current,
      currentAmount: { ...write.balance },
      movementCount: current.movementCount + 1,
      completedAt: write.completedAt,
    };

    this.byId.set(write.goalId, updated);
    return updated;
  }

  override async listAutoSaveDue(query: AutoSaveQuery): Promise<GoalRecord[]> {
    return this.open()
      .filter((goal) => goal.autoSave !== null && goal.autoSave.nextRunOn <= query.asOf)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
      .slice(0, query.limit);
  }

  /** Every stored goal, for assertions. */
  all(): GoalRecord[] {
    return [...this.byId.values()];
  }

  private open(): GoalRecord[] {
    return [...this.byId.values()].filter((goal) => goal.closedAt === null);
  }
}
