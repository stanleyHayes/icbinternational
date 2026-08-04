import { type ClientSession } from 'mongoose';

import { type AccountStatus, type AccountType } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { type StoredMoney } from '../../common/money/money.codec.js';

/**
 * What a service is allowed to know about account persistence.
 *
 * An abstract class rather than an interface because Nest resolves it as both a type and
 * an injection token, so no stringly-typed `@Inject('ACCOUNT_STORE')` has to be kept in
 * sync. Services depend on this; only `AccountRepository` knows Mongoose exists.
 *
 * The payoff is that the balance, hold and closure rules — the parts of this lane that
 * can actually lose a customer money — are exercised in milliseconds against an in-memory
 * implementation that enforces the same optimistic-concurrency contract, with no replica
 * set involved.
 */
export abstract class AccountStore {
  /**
   * Writes a new account, reporting a unique-index collision rather than throwing.
   *
   * The caller retries with a fresh serial. A pre-read cannot make this safe on its own:
   * two openings can pass the same check microseconds apart, and only the index arbitrates.
   */
  abstract insert(account: NewAccount, session?: ClientSession): Promise<InsertAccountResult>;

  abstract findById(id: string, session?: ClientSession): Promise<AccountRecord | null>;

  /** Resolution by domestic account number — how an inbound payment finds its target. */
  abstract findByNumber(number: string, session?: ClientSession): Promise<AccountRecord | null>;

  abstract findByIban(iban: string, session?: ClientSession): Promise<AccountRecord | null>;

  /** Every account a customer holds or co-holds, newest first. */
  abstract listByUser(query: AccountQuery): Promise<AccountRecord[]>;

  /**
   * Live accounts with no customer-initiated movement since `quietSince`, quietest first.
   *
   * Batched rather than streamed because the dormancy sweep is a housekeeping job that
   * runs on a schedule and is expected to make partial progress: marking a thousand
   * accounts tonight and the rest tomorrow is a perfectly good outcome.
   */
  abstract listDormancyCandidates(query: DormancyQuery): Promise<AccountRecord[]>;

  /**
   * Writes the balance triple, but only if the account is still at `expectedVersion`.
   *
   * Returns false when it is not. The caller's transaction must then be retried from the
   * top: the balances it computed were derived from a snapshot that has since moved, and
   * writing them would silently discard the other writer's posting.
   */
  abstract writeBalances(input: BalanceWriteInput): Promise<boolean>;

  /**
   * Applies a non-monetary change — status, nickname, primary flag — and bumps `version`.
   *
   * Separate from {@link writeBalances} so that renaming an account can never be the
   * thing that loses a posting, and so the balance path has exactly one writer.
   */
  abstract patch(input: AccountPatchInput): Promise<AccountRecord | null>;

  /** Clears `isPrimary` on the customer's other accounts in the same currency. */
  abstract clearPrimary(input: ClearPrimaryInput): Promise<void>;
}

/** A persisted account as services see it — a plain value, with no `.save()` on it. */
export interface AccountRecord {
  readonly id: string;
  readonly userId: string;
  readonly holderIds: readonly string[];
  readonly type: AccountType;
  readonly status: AccountStatus;
  readonly currency: string;
  readonly productCode: string;
  readonly productVersion: number;
  readonly productName: string;
  readonly nickname: string | null;
  readonly number: string;
  readonly sortCode: string;
  readonly iban: string;
  readonly ledgerBalance: StoredMoney;
  readonly availableBalance: StoredMoney;
  readonly holdTotal: StoredMoney;
  readonly overdraftLimit: StoredMoney;
  readonly minimumOpeningBalance: StoredMoney;
  readonly interestRateBps: number | null;
  readonly isPrimary: boolean;
  readonly openedAt: Date;
  readonly closedAt: Date | null;
  readonly dormantAt: Date | null;
  readonly lastActivityAt: Date;
  readonly version: number;
}

/** An account on its way in: no version yet, and nothing has happened to it. */
export type NewAccount = Omit<
  AccountRecord,
  'version' | 'closedAt' | 'dormantAt' | 'lastActivityAt'
>;

/** Which unique index rejected an insert, so the caller knows what to regenerate. */
export type UniqueAccountField = 'number' | 'iban';

export type InsertAccountResult =
  | { readonly account: AccountRecord; readonly conflictOn?: never }
  | { readonly account?: never; readonly conflictOn: UniqueAccountField };

export interface AccountQuery {
  readonly userId: string;
  readonly status?: AccountStatus;
  readonly type?: AccountType;
  readonly currency?: string;
  readonly session?: ClientSession;
}

export interface DormancyQuery {
  /** Accounts untouched since this instant are candidates. */
  readonly quietSince: Date;
  readonly limit: number;
  readonly session?: ClientSession;
}

export interface BalanceWriteInput {
  readonly accountId: string;
  /** The version the caller read. The write is refused if the document has moved on. */
  readonly expectedVersion: number;
  readonly ledgerBalance: Money;
  readonly availableBalance: Money;
  readonly holdTotal: Money;
  /** Set alongside the balances when a posting activates or wakes the account. */
  readonly status?: AccountStatus;
  /** Cleared when a posting wakes a dormant account; stamped by the dormancy sweep. */
  readonly dormantAt?: Date | null;
  readonly lastActivityAt?: Date;
  readonly session: ClientSession;
}

/** The fields a non-monetary patch may touch. Everything else on an account is immutable. */
export interface AccountPatchFields {
  readonly status?: AccountStatus;
  readonly nickname?: string | null;
  readonly isPrimary?: boolean;
  readonly closedAt?: Date | null;
  readonly dormantAt?: Date | null;
  readonly lastActivityAt?: Date;
  readonly overdraftLimit?: Money;
}

export interface AccountPatchInput {
  readonly accountId: string;
  /** Omit to patch unconditionally; supply to make the write conditional on the version. */
  readonly expectedVersion?: number;
  readonly fields: AccountPatchFields;
  readonly session?: ClientSession;
}

export interface ClearPrimaryInput {
  readonly userId: string;
  readonly currency: string;
  readonly exceptAccountId: string;
  readonly session?: ClientSession;
}
