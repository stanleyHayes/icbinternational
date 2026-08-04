import { type ClientSession } from 'mongoose';

import { type HoldReason, type HoldStatus } from '@reliance/contracts';

import { type StoredMoney } from '../../common/money/money.codec.js';

/**
 * What a service is allowed to know about hold persistence.
 *
 * An abstract class rather than an interface so Nest resolves it as both a type and an
 * injection token. The in-memory implementation enforces the same rules, which is what
 * lets the capture and expiry paths — the ones that can release the same money twice —
 * be tested exhaustively without a replica set.
 */
export abstract class HoldStore {
  /**
   * Writes a new hold and mints its public `hld_` id.
   *
   * The id is assigned here, as the ledger assigns a journal entry's, because it is a
   * persistence concern: a caller holding an id for a record that was never written is a
   * bug waiting to be logged.
   */
  abstract insert(hold: NewHold, session?: ClientSession): Promise<HoldRecord>;

  abstract findById(id: string, session?: ClientSession): Promise<HoldRecord | null>;

  /** Every live hold against an account. Reconciles `holdTotal` and lists pending items. */
  abstract listActive(accountId: string, session?: ClientSession): Promise<HoldRecord[]>;

  /**
   * Moves a hold out of `ACTIVE`, and only out of `ACTIVE`.
   *
   * Returns null when the hold has already been resolved. That conditional write is the
   * exactly-once guarantee for release and capture: two concurrent captures both read a
   * live hold, both try to resolve it, and precisely one succeeds — so the reserve is
   * given back once and the money is taken once.
   */
  abstract resolve(input: ResolveHoldInput): Promise<HoldRecord | null>;

  /** Live holds whose expiry has passed, oldest first. Feeds the expiry sweep. */
  abstract listExpired(query: ExpiredHoldQuery): Promise<HoldRecord[]>;

  /** Every hold in the system, admin-only — newest first. */
  abstract listAdmin(query: AdminHoldQuery): Promise<HoldRecord[]>;
}

/** A persisted hold as services see it — a plain value, with no `.save()` on it. */
export interface HoldRecord {
  readonly id: string;
  readonly accountId: string;
  readonly amount: StoredMoney;
  readonly reason: HoldReason;
  readonly status: HoldStatus;
  readonly description: string;
  readonly placedAt: Date;
  readonly expiresAt: Date | null;
  readonly resolvedAt: Date | null;
  readonly authorisationId: string | null;
  readonly capturedAmount: StoredMoney | null;
  readonly capturedEntryId: string | null;
}

/** A hold on its way in: no id, live by definition, and nothing resolved about it yet. */
export type NewHold = Omit<
  HoldRecord,
  'id' | 'status' | 'resolvedAt' | 'capturedAmount' | 'capturedEntryId'
>;

export interface ResolveHoldInput {
  readonly holdId: string;
  /** The terminal status. `ACTIVE` is not a legal destination. */
  readonly status: Exclude<HoldStatus, 'ACTIVE'>;
  readonly resolvedAt: Date;
  /** Set only by a capture, and only when it took less than the full hold. */
  readonly capturedAmount?: StoredMoney;
  readonly capturedEntryId?: string;
  readonly session?: ClientSession;
}

export interface ExpiredHoldQuery {
  /** Holds whose `expiresAt` is at or before this instant have lapsed. */
  readonly asOf: Date;
  readonly limit: number;
  readonly session?: ClientSession;
}

/** Admin-side hold listing — all accounts, no scope filter. */
export interface AdminHoldQuery {
  readonly cursor?: string;
  readonly limit: number;
}
