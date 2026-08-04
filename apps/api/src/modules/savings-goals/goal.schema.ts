import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { type StoredMoney } from '../../common/money/money.codec.js';
import {
  BASE_SCHEMA_OPTIONS,
  EMBEDDED_SCHEMA_OPTIONS,
  moneyProp,
  publicIdProp,
} from '../../database/schema.helpers.js';

import { AutoSaveFrequency } from './auto-save-schedule.js';
import { GOAL_COLLECTION } from './goal.constants.js';

/** A standing arrangement to move a fixed amount into a goal on a schedule. */
@Schema(EMBEDDED_SCHEMA_OPTIONS)
export class AutoSaveSchemaClass {
  @Prop(moneyProp)
  amount!: StoredMoney;

  @Prop({ type: String, required: true, enum: Object.values(AutoSaveFrequency) })
  frequency!: AutoSaveFrequency;

  /** Calendar date of the next run, advanced as each one completes. */
  @Prop({ type: String, required: true })
  nextRunOn!: string;
}

export const AutoSaveSchema = SchemaFactory.createForClass(AutoSaveSchemaClass);

/**
 * A savings goal and the vault attached to it.
 *
 * **`currentAmount` is the one stored figure that is not derived**, because it is a real
 * liability: the money has genuinely left the customer's current account and sits against
 * `2400 Savings Vaults` in the general ledger. Like every other balance projection in this
 * bank it is only correct for as long as exactly one thing writes it, and here that thing
 * is `GoalVaultService` by way of `GoalStore.applyVaultMovement` — a write conditional on
 * the balance the new figure was computed from.
 *
 * **`movementCount` is load-bearing, not a statistic.** It is what makes each movement's
 * ledger reference unique, so two contributions on the same day are two journal entries
 * rather than one and a silently discarded replay. It is incremented in the same
 * conditional update as the balance, which is what stops two racing movements from
 * deriving the same reference from the same stale read.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: GOAL_COLLECTION, id: false })
export class GoalSchemaClass {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ type: String, required: true, immutable: true, index: true })
  userId!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, default: null })
  emoji!: string | null;

  @Prop(moneyProp)
  targetAmount!: StoredMoney;

  /** What is in the vault right now. Moved only by a conditional vault write. */
  @Prop(moneyProp)
  currentAmount!: StoredMoney;

  @Prop({ type: String, default: null })
  targetDate!: string | null;

  /** The current account contributions come from and withdrawals return to. */
  @Prop({ type: String, required: true, immutable: true, index: true })
  linkedAccountId!: string;

  @Prop({ type: Boolean, required: true, default: false })
  roundUpsEnabled!: boolean;

  @Prop({ type: AutoSaveSchema, default: null })
  autoSave!: AutoSaveSchemaClass | null;

  /** Calendar date the goal was opened. The pace so far is measured from here. */
  @Prop({ type: String, required: true, immutable: true })
  startedOn!: string;

  @Prop({ type: Date, default: null })
  completedAt!: Date | null;

  @Prop({ type: Date, default: null })
  closedAt!: Date | null;

  /** How many movements the vault has seen. Part of every ledger reference. */
  @Prop({ type: Number, required: true, default: 0 })
  movementCount!: number;

  /** Optimistic-concurrency counter, incremented by every vault write. */
  @Prop({ type: Number, required: true, default: 0 })
  version!: number;

  /** Populated by Mongoose's `timestamps` option. */
  createdAt!: Date;
  updatedAt!: Date;
}

export type GoalDocument = HydratedDocument<GoalSchemaClass>;

export const GoalSchema = SchemaFactory.createForClass(GoalSchemaClass);

/** The customer's own list: their open goals, newest first. */
GoalSchema.index({ userId: 1, closedAt: 1, createdAt: -1 });

/**
 * Round-up targets for one account: open goals with round-ups switched on, oldest first.
 *
 * Partial, because a goal with round-ups off can never be a target and most goals have
 * them off. The sweep that funds a coffee's change must be one indexed read — it runs on
 * every card settlement in the bank.
 */
GoalSchema.index(
  { linkedAccountId: 1, createdAt: 1 },
  { partialFilterExpression: { roundUpsEnabled: true, closedAt: null } },
);

/** The auto-save run reads open goals whose next occurrence has arrived, oldest first. */
GoalSchema.index({ 'autoSave.nextRunOn': 1, createdAt: 1 });
