/**
 * Persistence for an overdraft facility.
 *
 * A facility is a record of what the bank has *agreed*, not of what is drawn. What is
 * drawn lives on the account, as a negative ledger balance, and is derived from it — there
 * is deliberately no "amount used" field here to fall out of step with the account it
 * describes.
 */

import { type ClientSession } from 'mongoose';

import { type StoredMoney } from '../../common/money/money.codec.js';

/** Where an overdraft facility has got to. */
export const OverdraftStatus = {
  /** Asked for, not yet decided. */
  REQUESTED: 'REQUESTED',
  /** Live. The limit is reflected in the account's available balance. */
  ACTIVE: 'ACTIVE',
  /** Withdrawn by the bank. Drawn balances stand and still accrue; nothing new may be drawn. */
  SUSPENDED: 'SUSPENDED',
  DECLINED: 'DECLINED',
  CLOSED: 'CLOSED',
} as const;
export type OverdraftStatus = (typeof OverdraftStatus)[keyof typeof OverdraftStatus];

/** A facility as services see it. */
export interface OverdraftRecord {
  readonly id: string;
  readonly userId: string;
  /** The current account the facility attaches to. One facility per account. */
  readonly accountId: string;
  readonly status: OverdraftStatus;
  readonly requestedLimit: StoredMoney;
  /** What was actually granted. Zero until a decision is made. */
  readonly limit: StoredMoney;
  readonly aprBps: number;
  /** An account the sweep may draw on to clear the overdraft. Null when none is nominated. */
  readonly sweepFromAccountId: string | null;
  readonly declineReasons: readonly string[];
  readonly requestedAt: Date;
  readonly decidedAt: Date | null;
  readonly closedAt: Date | null;
  /** Last business date interest was charged for, so a day is never charged twice. */
  readonly lastAccruedOn: string | null;
  /** Interest charged over the life of the facility. Reporting only. */
  readonly interestChargedToDate: StoredMoney;
}

/** A facility on its way in. */
export type NewOverdraft = Omit<OverdraftRecord, 'id'>;

/** The fields a facility can move through. */
export interface OverdraftPatchFields {
  readonly status?: OverdraftStatus;
  readonly limit?: StoredMoney;
  readonly aprBps?: number;
  readonly sweepFromAccountId?: string | null;
  readonly declineReasons?: readonly string[];
  readonly decidedAt?: Date | null;
  readonly closedAt?: Date | null;
  readonly lastAccruedOn?: string | null;
  readonly interestChargedToDate?: StoredMoney;
}

/** Facilities the daily interest run should look at on a given business date. */
export interface AccrualQuery {
  readonly asOf: string;
  readonly limit: number;
}

/**
 * The outcome of a conditional insert.
 *
 * Either the facility was written, or an `ACTIVE` one already held the account and is
 * returned instead so the caller can say which. Never both.
 */
export type InsertOverdraftResult =
  | { readonly facility: OverdraftRecord; readonly conflictWith?: never }
  | { readonly facility?: never; readonly conflictWith: OverdraftRecord };

export abstract class OverdraftStore {
  /**
   * Writes a facility, unless the account already has an `ACTIVE` one.
   *
   * The only way in. A plain `insert` would let a service check for a live facility, await
   * something — a credit decision, say — and insert against a world that has moved on;
   * two concurrent requests then leave one account holding two facilities, two limits, and
   * an available balance computed from whichever the store happens to return first.
   *
   * The condition and the write are one operation here, which is what makes it safe. In
   * MongoDB that is the unique partial index declared in `overdraft.schema.ts`; in the
   * in-memory store it is a check with no `await` between it and the write.
   */
  abstract insertIfNoActiveFacility(
    facility: NewOverdraft,
    session?: ClientSession,
  ): Promise<InsertOverdraftResult>;

  abstract findById(id: string, session?: ClientSession): Promise<OverdraftRecord | null>;

  /** The live facility on an account, if there is one. `null` otherwise. */
  abstract findActiveByAccount(
    accountId: string,
    session?: ClientSession,
  ): Promise<OverdraftRecord | null>;

  /**
   * The facility on an account, whatever state it is in.
   *
   * Includes closed ones. A customer who has had a facility withdrawn and asks for another
   * is a different decision from one who has never had one, and the only way to know which
   * is to be able to see the history.
   */
  abstract findByAccount(
    accountId: string,
    session?: ClientSession,
  ): Promise<OverdraftRecord | null>;

  abstract listByUser(userId: string): Promise<OverdraftRecord[]>;

  abstract patch(
    id: string,
    fields: OverdraftPatchFields,
    session?: ClientSession,
  ): Promise<OverdraftRecord | null>;

  /** Live facilities not yet charged for this business date, oldest first. */
  abstract listForAccrual(query: AccrualQuery): Promise<OverdraftRecord[]>;
}
