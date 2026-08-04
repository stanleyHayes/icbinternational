/**
 * What a service is allowed to know about how a loan is stored.
 *
 * An abstract class rather than an interface so Nest resolves it as both a type and an
 * injection token, matching the convention the accounts and holds modules already set.
 *
 * The instalment table is stored on the loan rather than in a collection of its own. A
 * schedule is meaningless apart from the loan it belongs to, is always read whole, and is
 * rewritten wholesale on a restructure — three properties that make it a sub-document
 * rather than a relation, and one that makes "the loan and its schedule agree" an
 * invariant of a single write instead of something to reconcile.
 */

import { type ClientSession } from 'mongoose';

import { type StoredMoney } from '../../common/money/money.codec.js';

import {
  type AmortisationRow,
  type LoanKind,
  type LoanStatus,
  type PaymentPlanStatus,
} from './loan.types.js';

/** One instalment as persisted, including how much of it has actually been paid. */
export interface ScheduleRowRecord {
  readonly instalment: number;
  readonly dueDate: string;
  readonly openingBalance: StoredMoney;
  readonly payment: StoredMoney;
  readonly principal: StoredMoney;
  readonly interest: StoredMoney;
  /** Late fees charged against this instalment. Starts at zero, grows in arrears. */
  readonly fees: StoredMoney;
  readonly closingBalance: StoredMoney;
  readonly status: AmortisationRow['status'];
  /** Cumulative amount applied to this instalment, across any number of payments. */
  readonly paidAmount: StoredMoney;
  readonly paidAt: Date | null;
}

/** An agreed arrangement to clear arrears over time. */
export interface PaymentPlanRecord {
  readonly instalmentAmount: StoredMoney;
  readonly instalments: number;
  readonly startsOn: string;
  readonly status: PaymentPlanStatus;
  readonly agreedAt: Date;
}

/** A loan as services see it — a plain value, with no `.save()` on it. */
export interface LoanRecord {
  readonly id: string;
  readonly userId: string;
  readonly applicationId: string;
  readonly productCode: string;
  readonly productName: string;
  readonly kind: LoanKind;
  readonly status: LoanStatus;
  /** Where the advance landed, and where repayments are collected from by default. */
  readonly disbursementAccountId: string;
  readonly principal: StoredMoney;
  readonly outstandingPrincipal: StoredMoney;
  /** Interest charged and not yet paid. Distinct from interest not yet charged. */
  readonly interestOutstanding: StoredMoney;
  /** Late fees charged and not yet paid. */
  readonly feesOutstanding: StoredMoney;
  readonly aprBps: number;
  readonly termMonths: number;
  readonly monthlyPayment: StoredMoney;
  readonly schedule: readonly ScheduleRowRecord[];
  readonly disbursedAt: Date;
  readonly maturesOn: string;
  readonly settledAt: Date | null;
  readonly writtenOffAt: Date | null;
  /** Loss allowance recognised against this loan so far. */
  readonly provisionHeld: StoredMoney;
  readonly paymentPlan: PaymentPlanRecord | null;
  /** Last business date the arrears sweep has processed, so it never double-charges. */
  readonly lastArrearsRunOn: string | null;
  /**
   * How many repayments have been collected.
   *
   * Not a statistic — it is the version this loan's balance is written against. Every
   * conditional write names the count it read, so a repayment computed from a stale
   * balance is refused rather than committed on top of somebody else's.
   */
  readonly repaymentCount: number;
  /**
   * The collection attempt the current balance reflects.
   *
   * Written in the same conditional update as the balance, so finding our own attempt id
   * here means that attempt already committed — which is how a re-run of an interrupted
   * transaction is told apart from a genuine second payment. Null until the first
   * repayment lands. Internal: it never reaches the wire.
   */
  readonly lastRepaymentId: string | null;
}

/** A loan on its way in: no id, and nothing has happened to it yet. */
export type NewLoan = Omit<LoanRecord, 'id'>;

/** The mutable fields of a loan. Everything absent from here is fixed at drawdown. */
export interface LoanPatchFields {
  readonly status?: LoanStatus;
  readonly outstandingPrincipal?: StoredMoney;
  readonly interestOutstanding?: StoredMoney;
  readonly feesOutstanding?: StoredMoney;
  readonly monthlyPayment?: StoredMoney;
  readonly aprBps?: number;
  readonly termMonths?: number;
  readonly maturesOn?: string;
  readonly schedule?: readonly ScheduleRowRecord[];
  readonly settledAt?: Date | null;
  readonly writtenOffAt?: Date | null;
  readonly provisionHeld?: StoredMoney;
  readonly paymentPlan?: PaymentPlanRecord | null;
  readonly lastArrearsRunOn?: string | null;
  readonly repaymentCount?: number;
  readonly lastRepaymentId?: string | null;
}

/**
 * The state a conditional write was computed from.
 *
 * `repaymentCount` is the loan's version for this purpose: it advances on every
 * collection, so naming the value that was read is enough to detect that the balance the
 * caller's figures were derived from is no longer the balance in the database.
 */
export interface LoanExpectation {
  readonly repaymentCount: number;
}

/** A patch that applies only while the loan still matches {@link LoanExpectation}. */
export interface ConditionalLoanPatch {
  readonly id: string;
  readonly expect: LoanExpectation;
  readonly fields: LoanPatchFields;
  readonly session?: ClientSession;
}

/** Which loans to return. Every query is scoped to a customer or to the whole book. */
export interface LoanQuery {
  readonly userId?: string;
  readonly status?: LoanStatus;
  readonly session?: ClientSession;
}

/** Loans the arrears sweep should look at on a given business date. */
export interface ArrearsSweepQuery {
  /** Loans not yet processed on this date. */
  readonly asOf: string;
  readonly limit: number;
}

export abstract class LoanStore {
  /** Writes a drawn-down loan and mints its public `loa_` id. */
  abstract insert(loan: NewLoan, session?: ClientSession): Promise<LoanRecord>;

  abstract findById(id: string, session?: ClientSession): Promise<LoanRecord | null>;

  abstract list(query: LoanQuery): Promise<LoanRecord[]>;

  /**
   * Applies a patch and returns the loan as it now stands.
   *
   * Returns null when the loan has gone, rather than throwing: a sweep racing a settlement
   * is an ordinary event, not an error, and the caller decides what to do about it.
   */
  abstract patch(
    id: string,
    fields: LoanPatchFields,
    session?: ClientSession,
  ): Promise<LoanRecord | null>;

  /**
   * Applies a patch only while the loan still matches `expect`, atomically.
   *
   * The unconditional {@link patch} is fine for a write whose value does not depend on
   * what was read. A repayment's is: its new balance is `balance − allocation`, computed
   * outside the database from a snapshot. Two concurrent repayments both read the same
   * snapshot, and the second's unconditional write would erase the first's — the loan
   * would shrink by one payment while the customer was debited for two. Naming the state
   * the figures came from turns that into a refusal the caller can retry from a fresh read.
   *
   * Returns null when the loan has gone *or* has moved on, deliberately without saying
   * which: both mean "these figures are no longer valid", and the caller re-reads either way.
   */
  abstract patchIf(input: ConditionalLoanPatch): Promise<LoanRecord | null>;

  /** Live loans the arrears sweep has not yet visited on this business date. */
  abstract listForArrearsSweep(query: ArrearsSweepQuery): Promise<LoanRecord[]>;
}
