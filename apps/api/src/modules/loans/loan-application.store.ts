/**
 * Persistence for a loan application, from first draft to drawdown.
 *
 * An application is kept apart from the loan it may become. Most applications never become
 * one, the two have almost no fields in common, and merging them would mean every query
 * over the lending book had to remember to exclude the applications — which is the sort of
 * filter that gets forgotten exactly once, in a regulatory return.
 */

import { type ClientSession } from 'mongoose';

import { type StoredMoney } from '../../common/money/money.codec.js';

import { type LoanApplicationStatus, type LoanQuote } from './loan.types.js';

/** An application as services see it. */
export interface LoanApplicationRecord {
  readonly id: string;
  readonly userId: string;
  readonly productCode: string;
  readonly status: LoanApplicationStatus;
  readonly requestedAmount: StoredMoney;
  readonly termMonths: number;
  readonly purpose: string;
  /** Where the advance goes if this is accepted. Fixed when the application is created. */
  readonly disbursementAccountId: string;
  /**
   * The finances the customer declared, kept so a re-decision uses the same figures.
   *
   * Re-deciding on freshly declared income would let an applicant nudge the numbers until
   * the engine agreed with them. The declaration is captured once, and changing it means
   * starting a new application — which is also what makes the audit trail meaningful.
   */
  readonly declaredMonthlyIncome: StoredMoney;
  readonly declaredMonthlyDebtPayments: StoredMoney;
  readonly declaredEmploymentMonths: number;
  /** The offer as quoted. Null until a decision has been made and an offer produced. */
  readonly offer: LoanQuote | null;
  readonly offerExpiresAt: Date | null;
  readonly declineReasons: readonly string[];
  /** What the applicant must supply. Emptied as documents arrive. */
  readonly requiredDocumentKinds: readonly string[];
  readonly suppliedDocumentKinds: readonly string[];
  /** The score the decision was made on, kept so a decision can always be explained. */
  readonly creditScore: number | null;
  readonly debtToIncomeBps: number | null;
  readonly submittedAt: Date | null;
  readonly decidedAt: Date | null;
  readonly acceptedAt: Date | null;
  readonly createdAt: Date;
  /** The loan this application became, once it has been drawn down. */
  readonly loanId: string | null;
}

/** An application on its way in. */
export type NewLoanApplication = Omit<LoanApplicationRecord, 'id'>;

/** The fields an application can move through. Everything else is fixed at creation. */
export interface LoanApplicationPatchFields {
  readonly status?: LoanApplicationStatus;
  readonly offer?: LoanQuote | null;
  readonly offerExpiresAt?: Date | null;
  readonly declineReasons?: readonly string[];
  readonly requiredDocumentKinds?: readonly string[];
  readonly suppliedDocumentKinds?: readonly string[];
  readonly creditScore?: number | null;
  readonly debtToIncomeBps?: number | null;
  readonly submittedAt?: Date | null;
  readonly decidedAt?: Date | null;
  readonly acceptedAt?: Date | null;
  readonly loanId?: string | null;
}

/**
 * A patch that applies only while the application is still in `from`.
 *
 * The status is the claim. Reading an application, deciding it may be drawn down and then
 * writing the result is three steps a second request can slip between; moving the status
 * atomically and acting only if the move succeeded collapses them into one, so exactly one
 * of two concurrent acceptances proceeds.
 */
export interface ApplicationClaim {
  readonly id: string;
  readonly from: LoanApplicationStatus;
  readonly fields: LoanApplicationPatchFields;
  readonly session?: ClientSession;
}

/** Which applications to return. */
export interface LoanApplicationQuery {
  readonly userId?: string;
  readonly status?: LoanApplicationStatus;
  readonly session?: ClientSession;
}

/** Offers that have run out of time on a given instant. */
export interface ExpiredOfferQuery {
  readonly asOf: Date;
  readonly limit: number;
}

export abstract class LoanApplicationStore {
  abstract insert(
    application: NewLoanApplication,
    session?: ClientSession,
  ): Promise<LoanApplicationRecord>;

  abstract findById(id: string, session?: ClientSession): Promise<LoanApplicationRecord | null>;

  abstract list(query: LoanApplicationQuery): Promise<LoanApplicationRecord[]>;

  abstract patch(
    id: string,
    fields: LoanApplicationPatchFields,
    session?: ClientSession,
  ): Promise<LoanApplicationRecord | null>;

  /**
   * Claims an application by moving it out of one status, atomically.
   *
   * @returns The claimed application, or null when somebody else got there first — which
   *   is the answer a caller about to lend money needs before it lends any.
   */
  abstract claim(input: ApplicationClaim): Promise<LoanApplicationRecord | null>;

  /** Live offers whose expiry has passed. Feeds the expiry sweep. */
  abstract listExpiredOffers(query: ExpiredOfferQuery): Promise<LoanApplicationRecord[]>;
}
