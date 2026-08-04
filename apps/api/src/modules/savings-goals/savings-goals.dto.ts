/**
 * Request shapes for savings goals beyond the frozen contract.
 *
 * The contract defines the goal and how one is created. It does not describe contributing,
 * withdrawing, editing, or setting up an auto-save — all four of which the route map
 * already names or implies. Written in the contract's style so they can be lifted into it
 * unchanged; `docs/CONTRACT_CHANGES.md` carries the proposal.
 */

import { z } from 'zod';

import { isoDateSchema, positiveMoneySchema, shortTextSchema } from '@reliance/contracts';

import { AutoSaveFrequency } from './auto-save-schedule.js';

/** Long enough for a composed emoji with a skin-tone or zero-width-joiner sequence. */
const MAX_EMOJI_LENGTH = 8;

/** Moving money into a goal by hand. */
export const contributeToGoalRequestSchema = z.object({
  amount: positiveMoneySchema,
});
export type ContributeToGoalRequest = z.infer<typeof contributeToGoalRequestSchema>;

/**
 * Taking money back out.
 *
 * There is no minimum and no notice period. A savings vault a customer cannot get at in a
 * hurry is a savings vault they will not put money into in the first place.
 */
export const withdrawFromGoalRequestSchema = z.object({
  amount: positiveMoneySchema,
});
export type WithdrawFromGoalRequest = z.infer<typeof withdrawFromGoalRequestSchema>;

/** Editing a goal. Every field is optional; anything omitted is left alone. */
export const updateGoalRequestSchema = z.object({
  name: shortTextSchema.optional(),
  emoji: z.string().max(MAX_EMOJI_LENGTH).nullable().optional(),
  targetAmount: positiveMoneySchema.optional(),
  targetDate: isoDateSchema.nullable().optional(),
  roundUpsEnabled: z.boolean().optional(),
});
export type UpdateGoalRequest = z.infer<typeof updateGoalRequestSchema>;

/** Setting up, changing or cancelling an automatic contribution. */
export const setAutoSaveRequestSchema = z
  .object({
    amount: positiveMoneySchema,
    frequency: z.enum(AutoSaveFrequency),
    /** First run. Defaults to one period from today when omitted. */
    startsOn: isoDateSchema.optional(),
  })
  .nullable();
export type SetAutoSaveRequest = z.infer<typeof setAutoSaveRequestSchema>;

/** Applying round-ups from card spend. Called by the cards lane, not by a customer. */
export const applyRoundUpsRequestSchema = z.object({
  accountId: z.string(),
  /** The purchases to round up, each a positive amount. */
  spends: z.array(positiveMoneySchema).min(1),
});
export type ApplyRoundUpsRequest = z.infer<typeof applyRoundUpsRequestSchema>;
