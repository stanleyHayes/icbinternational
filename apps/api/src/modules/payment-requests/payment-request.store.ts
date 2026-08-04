import { type ClientSession } from 'mongoose';

import { type PaymentRequestStatus } from '@reliance/contracts';

import { type StoredMoney } from '../../common/money/money.codec.js';

/**
 * What a service is allowed to know about payment-request persistence.
 *
 * Two reads exist deliberately: an owner-scoped list, and an unscoped lookup by id. The
 * unscoped one is not an oversight — a payment request is a *link*, and the person paying
 * it is by definition not the person who created it. What protects the request is that the
 * id is unguessable and that paying it requires an account of your own; what it cannot be
 * protected by is an owner check, because the owner is not the one clicking.
 */
export abstract class PaymentRequestStore {
  abstract insert(
    request: NewPaymentRequest,
    session?: ClientSession,
  ): Promise<PaymentRequestRecord>;

  /** The request behind a link. Unscoped — see the note on this class. */
  abstract findById(id: string, session?: ClientSession): Promise<PaymentRequestRecord | null>;

  /** Requests this customer raised, newest first. */
  abstract listByRequester(userId: string, limit: number): Promise<readonly PaymentRequestRecord[]>;

  /** Every request created by one split, so the requester sees who has paid. */
  abstract listBySplit(splitId: string): Promise<readonly PaymentRequestRecord[]>;

  /**
   * Moves a request to a new status, and only from one of `fromStatuses`.
   *
   * Returns null when it has already been settled, declined, cancelled or expired. That
   * condition is what makes "an expired request cannot be paid" true under concurrency
   * rather than merely checked beforehand.
   */
  abstract transition(input: PaymentRequestTransition): Promise<PaymentRequestRecord | null>;

  /** Open requests whose window has closed, for the expiry sweep. */
  abstract listLapsed(at: Date, limit: number): Promise<readonly PaymentRequestRecord[]>;
}

/** A persisted request as services see it. */
export interface PaymentRequestRecord {
  readonly id: string;
  /** The customer who asked to be paid. */
  readonly userId: string;
  readonly status: PaymentRequestStatus;
  readonly requesterName: string;
  /** Who was asked, when the request came from a split. Null for an open link. */
  readonly payeeName: string | null;
  readonly payeeEmail: string | null;
  readonly amount: StoredMoney;
  readonly note: string | null;
  /** The unguessable part of the share link and the QR payload. */
  readonly token: string;
  readonly destinationAccountId: string;
  /** Groups every request created by one split bill. */
  readonly splitId: string | null;
  readonly paidByUserId: string | null;
  readonly paidByName: string | null;
  readonly paidFromAccountId: string | null;
  readonly journalEntryId: string | null;
  readonly nudgeCount: number;
  readonly lastNudgedAt: Date | null;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly paidAt: Date | null;
}

/** A request on its way in: no id, open, unpaid and un-nudged. */
export type NewPaymentRequest = Omit<
  PaymentRequestRecord,
  | 'id'
  | 'status'
  | 'paidByUserId'
  | 'paidByName'
  | 'paidFromAccountId'
  | 'journalEntryId'
  | 'nudgeCount'
  | 'lastNudgedAt'
  | 'paidAt'
>;

export interface PaymentRequestTransition {
  readonly id: string;
  /** Only these statuses may be left. Anything else means somebody got there first. */
  readonly fromStatuses: readonly PaymentRequestStatus[];
  readonly status: PaymentRequestStatus;
  readonly patch?: Partial<
    Pick<
      PaymentRequestRecord,
      'paidByUserId' | 'paidByName' | 'paidFromAccountId' | 'journalEntryId' | 'paidAt'
    >
  >;
  /**
   * When set, the write also requires the request to still be inside its window.
   *
   * Carried into the filter rather than checked beforehand, so a request that lapses while
   * the payer is authorising matches nothing and the payment rolls back with it. Expiry is
   * the one precondition that can become false without anybody doing anything, which is
   * exactly the kind a check-then-write cannot hold.
   */
  readonly liveAt?: Date;
  /** Records a reminder as part of the same write, so the count cannot drift. */
  readonly nudgedAt?: Date;
  readonly session?: ClientSession;
}
