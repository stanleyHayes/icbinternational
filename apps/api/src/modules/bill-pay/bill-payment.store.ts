import { type ClientSession } from 'mongoose';

import { type BillPaymentStatus } from '@reliance/contracts';

import { type StoredMoney } from '../../common/money/money.codec.js';
import { type BillerRejection } from '../../rails/biller/index.js';

/** Whether the payment is a bill or a mobile top-up. The rail differs; the lifecycle does not. */
export const PaymentKind = { BILL: 'BILL', TOP_UP: 'TOP_UP' } as const;
export type PaymentKind = (typeof PaymentKind)[keyof typeof PaymentKind];

/** The extra detail a top-up carries and a bill payment does not. */
export interface TopUpDetail {
  readonly provider: string;
  readonly phone: string;
  readonly bundle: 'AIRTIME' | 'DATA';
  readonly bundleCode: string | null;
}

/**
 * What a service is allowed to know about bill-payment persistence.
 *
 * The method that matters is {@link transition}. Every status change is a conditional
 * write from an expected set of statuses, so the submission job, a retry of that job and an
 * operator acting at the same moment cannot each move the same payment. A payment that has
 * already been refunded must not be settled by a late acknowledgement, and that is enforced
 * by the filter rather than by a check somebody has to remember to write.
 */
export abstract class BillPaymentStore {
  abstract insert(payment: NewBillPayment, session?: ClientSession): Promise<BillPaymentRecord>;

  abstract findById(
    id: string,
    userId: string,
    session?: ClientSession,
  ): Promise<BillPaymentRecord | null>;

  /** The payment regardless of who owns it. For the submission job only. */
  abstract findByIdUnscoped(id: string, session?: ClientSession): Promise<BillPaymentRecord | null>;

  /** The customer's payments, newest first. */
  abstract list(query: BillPaymentListQuery): Promise<readonly BillPaymentRecord[]>;

  /**
   * Moves a payment to a new status, and only from one of `fromStatuses`.
   *
   * Returns null when it has already moved on — somebody else got there first.
   */
  abstract transition(input: BillPaymentTransition): Promise<BillPaymentRecord | null>;

  /** Payments whose scheduled time has arrived and which have not been submitted yet. */
  abstract dueForSubmission(at: Date, limit: number): Promise<readonly BillPaymentRecord[]>;

  /**
   * Payments that owe the customer money and have sat that way too long.
   *
   * Two shapes qualify. A payment in `REJECTED` with no `reversalEntryId` is one whose
   * reversal transaction did not land — the biller's answer is known and the credit is not
   * there. A payment still in `SUBMITTED` is one whose job died before it could record any
   * answer at all; the network has long since stopped talking, and the standing policy for a
   * payment nobody can account for is that the money goes back.
   *
   * Both are read oldest-first, so the customer who has been waiting longest is paid first.
   */
  abstract awaitingRefund(input: StrandedQuery): Promise<readonly BillPaymentRecord[]>;
}

/** Which stranded payments a sweep pass should take on. */
export interface StrandedQuery {
  /** Only payments submitted at or before this instant, on the bank's clock. */
  readonly before: Date;
  readonly limit: number;
}

/** A persisted payment as services see it. */
export interface BillPaymentRecord {
  readonly id: string;
  readonly userId: string;
  readonly kind: PaymentKind;
  readonly billerId: string;
  readonly billerName: string;
  readonly status: BillPaymentStatus;
  readonly sourceAccountId: string;
  readonly customerReference: string;
  readonly amount: StoredMoney;
  readonly fee: StoredMoney;
  readonly topUp: TopUpDetail | null;
  /** The customer's proof of payment, once the biller has issued one. */
  readonly billerReceipt: string | null;
  /**
   * Why the biller refused, as a code. Null until one does.
   *
   * Kept alongside {@link failureReason} rather than instead of it, because the prose is
   * chosen per status — a payment awaiting its refund and a payment that has had it say
   * different things — and a sweep finishing somebody else's reversal needs to re-derive
   * that prose without having the rail's answer in front of it.
   */
  readonly rejection: BillerRejection | null;
  readonly failureReason: string | null;
  /** The statement row for the debit. Null until the projection has been written. */
  readonly transactionId: string | null;
  /** The entry that took the money. Present from creation — the debit is immediate. */
  readonly journalEntryId: string | null;
  /** The entry that settled it against the network. */
  readonly settlementEntryId: string | null;
  /** The entry that gave the money back. */
  readonly reversalEntryId: string | null;
  /** The fee entry, booked only on completion. */
  readonly feeEntryId: string | null;
  readonly attempts: number;
  /** How long the network took to answer the last attempt, in milliseconds. */
  readonly lastLatencyMs: number | null;
  /** When the payment should go out. Equal to `createdAt` for an instant payment. */
  readonly scheduledFor: Date;
  readonly createdAt: Date;
  readonly submittedAt: Date | null;
  readonly completedAt: Date | null;
}

/** A payment on its way in: no id, nothing attempted, nothing returned. */
export type NewBillPayment = Omit<
  BillPaymentRecord,
  | 'id'
  | 'billerReceipt'
  | 'rejection'
  | 'failureReason'
  | 'settlementEntryId'
  | 'reversalEntryId'
  | 'feeEntryId'
  | 'attempts'
  | 'lastLatencyMs'
  | 'submittedAt'
  | 'completedAt'
>;

export interface BillPaymentListQuery {
  readonly userId: string;
  readonly limit: number;
  readonly status?: BillPaymentStatus;
  readonly billerId?: string;
}

/** Fields a transition may set alongside the status. */
export interface BillPaymentTransition {
  readonly id: string;
  /** Only these statuses may be left. Anything else means somebody got there first. */
  readonly fromStatuses: readonly BillPaymentStatus[];
  readonly status: BillPaymentStatus;
  readonly patch?: Partial<
    Pick<
      BillPaymentRecord,
      | 'billerReceipt'
      | 'rejection'
      | 'failureReason'
      | 'transactionId'
      | 'journalEntryId'
      | 'settlementEntryId'
      | 'reversalEntryId'
      | 'feeEntryId'
      | 'lastLatencyMs'
      | 'submittedAt'
      | 'completedAt'
    >
  >;
  /** Increments the attempt counter as part of the same write. */
  readonly countAttempt?: boolean;
  readonly session?: ClientSession;
}
