/**
 * Persistence for a savings goal and its vault.
 *
 * The vault balance is stored on the goal, and it is the one number here that is not
 * derived. It has to be stored because it is a real liability of the bank — the money has
 * genuinely left the customer's current account — and it is reconciled against the ledger
 * by the same control-total check that covers every other balance.
 */

import { type ClientSession } from 'mongoose';

import { type StoredMoney } from '../../common/money/money.codec.js';

import { type AutoSaveFrequency } from './auto-save-schedule.js';

/** An arrangement to move a fixed amount into a goal on a schedule. */
export interface AutoSaveRecord {
  readonly amount: StoredMoney;
  readonly frequency: AutoSaveFrequency;
  /** Calendar date of the next run. Advanced as each run completes. */
  readonly nextRunOn: string;
}

/** A goal as services see it. */
export interface GoalRecord {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly emoji: string | null;
  readonly targetAmount: StoredMoney;
  /** What is in the vault right now. */
  readonly currentAmount: StoredMoney;
  readonly targetDate: string | null;
  /** The current account contributions come from and withdrawals return to. */
  readonly linkedAccountId: string;
  readonly roundUpsEnabled: boolean;
  readonly autoSave: AutoSaveRecord | null;
  /** Calendar date the goal was opened. The pace so far is measured from here. */
  readonly startedOn: string;
  readonly completedAt: Date | null;
  readonly closedAt: Date | null;
  readonly createdAt: Date;
  /**
   * How many movements the vault has seen.
   *
   * Not a statistic — it is what makes each contribution's ledger reference unique, so two
   * contributions on the same day are two entries rather than one and a discarded replay.
   */
  readonly movementCount: number;
}

/** A goal on its way in. */
export type NewGoal = Omit<GoalRecord, 'id'>;

/**
 * The fields a goal can change. Name, target and date are all editable; the vault is not.
 *
 * `currentAmount` and `movementCount` are deliberately absent. They are the vault, and the
 * only way to move them is {@link GoalStore.applyVaultMovement}, which is conditional on
 * the balance the caller computed its delta from. Leaving them patchable is what allowed a
 * withdrawal to write an absolute figure derived from a read taken before the posting —
 * two of those racing overwrote each other and left the vault holding money the ledger had
 * never funded.
 */
export interface GoalPatchFields {
  readonly name?: string;
  readonly emoji?: string | null;
  readonly targetAmount?: StoredMoney;
  readonly targetDate?: string | null;
  readonly roundUpsEnabled?: boolean;
  readonly autoSave?: AutoSaveRecord | null;
  readonly completedAt?: Date | null;
  readonly closedAt?: Date | null;
}

/**
 * Every field a patch may touch, in one list.
 *
 * The list exists so that {@link pickPatchFields} can be an allow-list rather than a
 * filter over whatever the caller happened to pass. TypeScript already forbids a vault
 * field here, but a `patch` that spread its argument would apply one anyway the moment a
 * cast, a stray `as never`, or a JSON body found its way in — and that write would be the
 * unconditional absolute the vault was rebuilt to make impossible.
 */
const PATCHABLE_FIELDS = [
  'name',
  'emoji',
  'targetAmount',
  'targetDate',
  'roundUpsEnabled',
  'autoSave',
  'completedAt',
  'closedAt',
] as const satisfies readonly (keyof GoalPatchFields)[];

/**
 * The patch as a plain object, carrying only fields that are both allowed and supplied.
 *
 * Omitted keys are dropped rather than written as `undefined`, so a patch never clears a
 * field the caller simply did not mention.
 */
export function pickPatchFields(fields: GoalPatchFields): Record<string, unknown> {
  const supplied = fields as Record<string, unknown>;

  return Object.fromEntries(
    PATCHABLE_FIELDS.filter((key) => supplied[key] !== undefined).map((key) => [
      key,
      supplied[key],
    ]),
  );
}

/**
 * One conditional movement of a vault balance.
 *
 * The write lands only if the goal still holds `expected` and has still seen
 * `expectedMovementCount` movements — the two values the new balance and the ledger
 * reference were derived from. Anything else means the vault moved between the read and
 * the write, the delta was computed against a balance that no longer exists, and the whole
 * unit of work has to run again from a fresh read.
 *
 * This is a compare-and-set rather than a bare `$inc` because a stored amount is a
 * minor-unit *string* — `$inc` cannot touch it, and a numeric round-trip would defeat the
 * reason it is stored as a string. Guarding the write on the exact value it was computed
 * from makes the `$set` relative in the only sense that matters: it can only ever land on
 * top of the balance the delta was taken against. The counters beside it do use `$inc`.
 */
export interface VaultWriteInput {
  readonly goalId: string;
  /** The balance the new one was computed from. */
  readonly expected: StoredMoney;
  /** The movement count the ledger reference was derived from. */
  readonly expectedMovementCount: number;
  /** The balance to write: `expected` plus the signed delta. */
  readonly balance: StoredMoney;
  readonly completedAt: Date | null;
  readonly session?: ClientSession;
}

/** Which goals to return. */
export interface GoalQuery {
  readonly userId?: string;
  /** Omit closed goals, which is what a customer's list wants by default. */
  readonly openOnly?: boolean;
  readonly session?: ClientSession;
}

/** Goals whose auto-save is due on a business date. */
export interface AutoSaveQuery {
  readonly asOf: string;
  readonly limit: number;
  readonly session?: ClientSession;
}

export abstract class GoalStore {
  abstract insert(goal: NewGoal, session?: ClientSession): Promise<GoalRecord>;

  abstract findById(id: string, session?: ClientSession): Promise<GoalRecord | null>;

  abstract list(query: GoalQuery): Promise<GoalRecord[]>;

  /**
   * Open goals with round-ups switched on, for one account.
   *
   * An account can feed several goals. The round-up from one purchase goes to the oldest
   * of them rather than being split, because splitting a forty-pence round-up three ways
   * produces amounts too small to be worth a ledger entry.
   */
  abstract listRoundUpTargets(accountId: string, session?: ClientSession): Promise<GoalRecord[]>;

  abstract patch(
    id: string,
    fields: GoalPatchFields,
    session?: ClientSession,
  ): Promise<GoalRecord | null>;

  /**
   * Moves the vault balance, conditionally on the balance it was computed from.
   *
   * @returns The goal as written, or `null` when the condition no longer holds — the goal
   *   was closed, removed, or moved by somebody else. A `null` is never a business
   *   failure; it means the caller's transaction must abort and run again.
   */
  abstract applyVaultMovement(write: VaultWriteInput): Promise<GoalRecord | null>;

  /** Open goals whose next auto-save run has arrived, oldest first. */
  abstract listAutoSaveDue(query: AutoSaveQuery): Promise<GoalRecord[]>;
}
