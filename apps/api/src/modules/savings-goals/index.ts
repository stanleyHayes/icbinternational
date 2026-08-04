/**
 * The savings goals module's public surface.
 *
 * The cards lane calls `GoalAutomationService.applyRoundUps` as spend settles; the
 * simulation lane drives the auto-save run. Neither needs to know how a vault is stored.
 */

export { SavingsGoalsModule } from './savings-goals.module.js';

export { AutoSaveFrequency, dueRuns, nextRunAfter } from './auto-save-schedule.js';

export {
  progressBps,
  projectGoal,
  remaining,
  type GoalProjection,
  type ProjectionRequest,
} from './goal-projection.js';

export { roundUpFor, roundUpTotal } from './round-up.js';
export { goalEntries } from './goal-entries.js';

export {
  AUTOMATION_BATCH_SIZE,
  GOAL_COLLECTION,
  GOAL_MODEL,
  GOAL_REFERENCE_PREFIX,
  GOAL_TRANSACTION_LABEL,
  MAX_ROUND_UP_MINOR_UNITS,
  ON_TRACK_TOLERANCE_BPS,
  ROUND_UP_MULTIPLE_MINOR_UNITS,
} from './goal.constants.js';

export { GoalService, goalNotFound } from './goal.service.js';
export { GoalVaultService, VaultMovement, type VaultRequest } from './goal-vault.service.js';
export { GoalAutomationService } from './goal-automation.service.js';
export { VaultWriteConflictError } from './goal-concurrency.js';

export {
  GoalStore,
  type AutoSaveQuery,
  type AutoSaveRecord,
  type GoalPatchFields,
  type GoalQuery,
  type GoalRecord,
  type NewGoal,
  type VaultWriteInput,
} from './goal.store.js';
export { InMemoryGoalStore } from './in-memory-goal.store.js';
export { GoalRepository } from './goal.repository.js';
export {
  AutoSaveSchema,
  AutoSaveSchemaClass,
  GoalSchema,
  GoalSchemaClass,
  type GoalDocument,
} from './goal.schema.js';

export { toContractGoal } from './goal.mapper.js';
export * from './savings-goals.dto.js';
