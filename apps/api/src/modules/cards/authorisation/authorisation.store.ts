import { type ClientSession } from 'mongoose';

import {
  type AuthorisationStatus,
  type CardAuthorisation,
  type DeclineReason,
} from '@reliance/contracts';

import { type StoredMoney } from '../../../common/money/money.codec.js';

/** The channel an authorisation arrived over, as the contract spells it. */
export type AuthorisationChannel = CardAuthorisation['channel'];

/**
 * One authorisation, approved or declined.
 *
 * Declines are stored, not discarded. "Why was my card refused?" is the single commonest
 * question a card issuer is asked, and it is unanswerable if the only record of a decline
 * is a log line that rolled off a week ago.
 */
export interface AuthorisationRecord {
  readonly id: string;
  readonly cardId: string;
  readonly accountId: string;
  readonly userId: string;
  readonly status: AuthorisationStatus;
  /** What was approved. On a partial approval, less than {@link requestedAmount}. */
  readonly amount: StoredMoney;
  readonly requestedAmount: StoredMoney;
  /** The merchant's own currency amount, when it differed. */
  readonly originalAmount: StoredMoney | null;
  readonly merchantId: string;
  readonly merchantName: string;
  readonly merchantCountry: string;
  readonly mcc: string;
  readonly channel: AuthorisationChannel;
  readonly declineReason: DeclineReason | null;
  /** ISO 8583 field 39 code returned to the acquirer. `00` on an approval. */
  readonly responseCode: string;
  readonly holdId: string | null;
  readonly journalEntryId: string | null;
  readonly transactionId: string | null;
  readonly threeDsChallenged: boolean;
  readonly threeDsOutcome: string | null;
  readonly networkReference: string;
  readonly clearingReference: string | null;
  readonly settlementBatchId: string | null;
  readonly capturedAmount: StoredMoney | null;
  readonly refundedAmount: StoredMoney | null;
  /** How many times the merchant raised the hold without re-authorising from scratch. */
  readonly incrementCount: number;
  readonly authorisedAt: Date;
  readonly capturedAt: Date | null;
  readonly clearedAt: Date | null;
  readonly settledAt: Date | null;
  readonly reversedAt: Date | null;
  readonly expiresAt: Date;
}

/** An authorisation on its way in. The store mints the id. */
export type NewAuthorisation = Omit<AuthorisationRecord, 'id'>;

/** Fields that change after the issuer has answered. */
export interface AuthorisationPatchFields {
  readonly status?: AuthorisationStatus;
  readonly amount?: StoredMoney;
  readonly holdId?: string | null;
  readonly journalEntryId?: string | null;
  readonly transactionId?: string | null;
  readonly capturedAmount?: StoredMoney | null;
  readonly refundedAmount?: StoredMoney | null;
  readonly clearingReference?: string | null;
  readonly settlementBatchId?: string | null;
  readonly incrementCount?: number;
  readonly threeDsChallenged?: boolean;
  readonly threeDsOutcome?: string | null;
  readonly capturedAt?: Date;
  readonly clearedAt?: Date;
  readonly settledAt?: Date;
  readonly reversedAt?: Date;
  readonly expiresAt?: Date;
}

export interface AuthorisationPatchInput {
  readonly authorisationId: string;
  readonly fields: AuthorisationPatchFields;
  /**
   * Only apply if the authorisation is currently in one of these states.
   *
   * Capture, reversal and expiry all race for the same authorisation, and each of them
   * gives a hold back. The guard is what makes exactly one of them win.
   */
  readonly expectedStatuses?: readonly AuthorisationStatus[];
  readonly session?: ClientSession;
}

export interface AuthorisationQuery {
  readonly userId: string;
  readonly cardId?: string;
  readonly status?: AuthorisationStatus;
  readonly cursor?: string;
  readonly limit: number;
}

/** Approved-and-unclaimed authorisations against one card inside a time window. */
export interface SpendWindowQuery {
  readonly cardId: string;
  readonly from: Date;
  readonly channel?: AuthorisationChannel;
  readonly session?: ClientSession;
}

/** Cleared authorisations waiting for a settlement batch. */
export interface ClearedQuery {
  readonly asOf: Date;
  readonly limit: number;
}

/**
 * What a service is allowed to know about authorisation persistence.
 *
 * An abstract class rather than an interface so Nest resolves it as both a type and an
 * injection token.
 */
export abstract class AuthorisationStore {
  abstract insert(
    authorisation: NewAuthorisation,
    session?: ClientSession,
  ): Promise<AuthorisationRecord>;

  abstract findById(id: string, session?: ClientSession): Promise<AuthorisationRecord | null>;

  abstract list(query: AuthorisationQuery): Promise<{ records: AuthorisationRecord[] }>;

  /** Conditional update. Null when the expected-status guard did not match. */
  abstract patch(input: AuthorisationPatchInput): Promise<AuthorisationRecord | null>;

  /**
   * Authorisations that count against a spending limit in a window.
   *
   * Approved *and* captured both count. An authorisation the merchant has already claimed
   * has still been spent, and excluding it would let a customer breach a daily limit
   * simply by shopping somewhere that clears quickly.
   */
  abstract listInWindow(query: SpendWindowQuery): Promise<AuthorisationRecord[]>;

  /** Live approvals past their expiry, oldest first. Feeds the expiry sweep. */
  abstract listExpired(query: ClearedQuery): Promise<AuthorisationRecord[]>;

  /** Cleared but unsettled authorisations, oldest first. Feeds the settlement batch. */
  abstract listCleared(query: ClearedQuery): Promise<AuthorisationRecord[]>;

  /** Every authorisation on a card, newest first. Feeds spend insights. */
  abstract listByCard(cardId: string, limit: number): Promise<AuthorisationRecord[]>;
}
