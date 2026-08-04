/**
 * Persistence for a term deposit.
 *
 * A deposit is immutable in every way that matters: the principal, the rate and the term
 * are fixed when it is placed and the only things that ever change are its status, whether
 * it will roll over, and — on a rollover — which deposit succeeded it. Modelling it that
 * way means a matured deposit is a permanent record of what was actually agreed, rather
 * than a row that has been edited into its successor.
 */

import { type ClientSession } from 'mongoose';

import { type StoredMoney } from '../../common/money/money.codec.js';

import { type DepositStatus } from './deposit.types.js';

/** A deposit as services see it. */
export interface DepositRecord {
  readonly id: string;
  readonly userId: string;
  readonly status: DepositStatus;
  /** The account the money came from, and the one it returns to. */
  readonly sourceAccountId: string;
  readonly principal: StoredMoney;
  readonly annualRateBps: number;
  readonly termMonths: number;
  readonly autoRollover: boolean;
  /** Calendar date the money left the current account. Interest runs from here. */
  readonly placedOn: string;
  readonly maturesOn: string;
  readonly placedAt: Date;
  readonly maturedAt: Date | null;
  readonly brokenAt: Date | null;
  /** Interest actually paid out, once it has been. Null while the deposit is running. */
  readonly interestPaid: StoredMoney | null;
  /** The deposit this one rolled into, so a chain of renewals can be followed. */
  readonly rolledIntoId: string | null;
  /** The deposit this one rolled out of. Null on a first placement. */
  readonly rolledFromId: string | null;
}

/** A deposit on its way in. */
export type NewDeposit = Omit<DepositRecord, 'id'>;

/** The few fields a deposit can move through. */
export interface DepositPatchFields {
  readonly status?: DepositStatus;
  readonly autoRollover?: boolean;
  readonly maturedAt?: Date | null;
  readonly brokenAt?: Date | null;
  readonly interestPaid?: StoredMoney | null;
  readonly rolledIntoId?: string | null;
}

/** Which deposits to return. */
export interface DepositQuery {
  readonly userId?: string;
  readonly status?: DepositStatus;
  readonly session?: ClientSession;
}

/** Deposits reaching maturity on or before a business date. */
export interface MaturityQuery {
  readonly asOf: string;
  readonly limit: number;
}

export abstract class DepositStore {
  abstract insert(deposit: NewDeposit, session?: ClientSession): Promise<DepositRecord>;

  abstract findById(id: string, session?: ClientSession): Promise<DepositRecord | null>;

  abstract list(query: DepositQuery): Promise<DepositRecord[]>;

  abstract patch(
    id: string,
    fields: DepositPatchFields,
    session?: ClientSession,
  ): Promise<DepositRecord | null>;

  /**
   * Active deposits whose maturity date has arrived, oldest first.
   *
   * Only active ones. A deposit that was broken last week has a maturity date in the
   * future and must never be picked up by the maturity run and paid out twice.
   */
  abstract listMaturing(query: MaturityQuery): Promise<DepositRecord[]>;
}
