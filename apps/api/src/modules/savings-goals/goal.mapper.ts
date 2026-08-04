/**
 * A stored goal as the contract publishes it.
 *
 * Progress, the suggested contribution and whether the customer is on track are all
 * projected against the business date rather than stored, so a goal card is correct the
 * moment it is read and nothing has to run overnight to keep three derived fields honest.
 */

import { type Goal } from '@reliance/contracts';

import { fromStored, toWire } from '../../common/money/money.codec.js';

import { projectGoal } from './goal-projection.js';
import { type GoalRecord } from './goal.store.js';

/** Maps one goal, projected as at a business date. */
export function toContractGoal(goal: GoalRecord, asOf: string): Goal {
  const projection = projectGoal({
    target: fromStored(goal.targetAmount),
    current: fromStored(goal.currentAmount),
    startedOn: goal.startedOn,
    targetDate: goal.targetDate,
    asOf,
  });

  return {
    id: goal.id,
    name: goal.name,
    emoji: goal.emoji,
    targetAmount: toWire(fromStored(goal.targetAmount)),
    currentAmount: toWire(fromStored(goal.currentAmount)),
    progressBps: projection.progressBps,
    targetDate: goal.targetDate,
    suggestedMonthlyContribution: projection.suggestedMonthlyContribution
      ? toWire(projection.suggestedMonthlyContribution)
      : null,
    onTrack: projection.onTrack,
    linkedAccountId: goal.linkedAccountId,
    roundUpsEnabled: goal.roundUpsEnabled,
    autoSave: goal.autoSave
      ? {
          amount: toWire(fromStored(goal.autoSave.amount)),
          frequency: goal.autoSave.frequency,
          nextRunAt: `${goal.autoSave.nextRunOn}T00:00:00.000Z`,
        }
      : null,
    completedAt: goal.completedAt ? goal.completedAt.toISOString() : null,
    createdAt: goal.createdAt.toISOString(),
  };
}
