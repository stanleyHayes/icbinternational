/**
 * Lending: loan products, eligibility, applications, servicing and overdrafts.
 *
 * `calculate` is deliberately unauthenticated-friendly and `eligibility` is not. The
 * first is a marketing calculator with no bearing on the customer's file; the second
 * runs a real assessment and is visible to underwriting.
 */

import {
  amortisationRowSchema,
  loanApplicationSchema,
  loanEligibilitySchema,
  loanProductSchema,
  loanQuoteSchema,
  loanSchema,
  paginated,
  payoffQuoteSchema,
  resource,
  routes,
  type AmortisationRow,
  type CreateLoanApplicationRequest,
  type CursorQuery,
  type Loan,
  type LoanApplication,
  type LoanApplicationStatus,
  type LoanCalculationRequest,
  type LoanEligibility,
  type LoanKind,
  type LoanProduct,
  type LoanQuote,
  type LoanStatus,
  type Paginated,
  type PayoffQuote,
  type RepayLoanRequest,
  type Resource,
} from '@reliance/contracts';

import { withIdempotencyKey } from '../core/idempotency.js';
import type { HttpTransport } from '../core/transport.js';
import type { MutationOptions, QueryOptions } from '../core/types.js';

const productList = paginated(loanProductSchema);
const quoteResource = resource(loanQuoteSchema);
const eligibilityResource = resource(loanEligibilitySchema);
const applicationList = paginated(loanApplicationSchema);
const applicationResource = resource(loanApplicationSchema);
const loanList = paginated(loanSchema);
const loanResource = resource(loanSchema);
const scheduleList = paginated(amortisationRowSchema);
const payoffResource = resource(payoffQuoteSchema);

/** Filters for the product catalogue. */
export type ListLoanProductsQuery = {
  readonly kind?: LoanKind | undefined;
  readonly currency?: string | undefined;
};

/** Filters for the application list. */
export type ListLoanApplicationsQuery = {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly status?: LoanApplicationStatus | undefined;
};

/** Filters for the loan book. */
export type ListLoansQuery = {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly status?: LoanStatus | undefined;
};

/** Body of an eligibility check. */
export interface LoanEligibilityRequest {
  readonly productCode: string;
  readonly amount: { readonly amount: string; readonly currency: string };
  readonly termMonths: number;
}

/** Body of an overdraft request. */
export interface RequestOverdraftRequest {
  readonly accountId: string;
  readonly limit: { readonly amount: string; readonly currency: string };
  readonly reason?: string;
}

/** Builds the `client.borrow` group. */
export function createBorrowResource(http: HttpTransport) {
  return {
    /** The lending catalogue, with representative rates. */
    products: (
      query?: ListLoanProductsQuery,
      options?: QueryOptions,
    ): Promise<Paginated<LoanProduct>> =>
      http.get({ ...options, path: routes.borrow.products, query, schema: productList }),

    /**
     * Illustrative repayment schedule for an amount and term.
     *
     * The schedule sums exactly to principal plus interest: the final instalment absorbs
     * the rounding, so no customer ever discovers a stray penny in month 60.
     */
    calculate: (
      body: LoanCalculationRequest,
      options?: MutationOptions,
    ): Promise<Resource<LoanQuote>> =>
      http.post({ ...options, path: routes.borrow.calculate, body, schema: quoteResource }),

    /** A real assessment against the customer's file, with an indicative rate. */
    eligibility: (
      body: LoanEligibilityRequest,
      options?: MutationOptions,
    ): Promise<Resource<LoanEligibility>> =>
      http.post({
        ...options,
        path: routes.borrow.eligibility,
        body,
        schema: eligibilityResource,
      }),

    /** The customer's loan applications. */
    listApplications: (
      query?: ListLoanApplicationsQuery,
      options?: QueryOptions,
    ): Promise<Paginated<LoanApplication>> =>
      http.get({ ...options, path: routes.borrow.applications, query, schema: applicationList }),

    /** Submits an application. */
    apply: (
      body: CreateLoanApplicationRequest,
      options?: MutationOptions,
    ): Promise<Resource<LoanApplication>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.borrow.applications,
        body,
        schema: applicationResource,
      }),

    /** One application, including the offer once underwriting has made one. */
    getApplication: (id: string, options?: QueryOptions): Promise<Resource<LoanApplication>> =>
      http.get({ ...options, path: routes.borrow.application(id), schema: applicationResource }),

    /** Withdraws an application the customer no longer wants. */
    withdrawApplication: (
      id: string,
      options?: MutationOptions,
    ): Promise<Resource<LoanApplication>> =>
      http.delete({
        ...options,
        path: routes.borrow.application(id),
        schema: applicationResource,
      }),

    /** Accepts an offer. Refused once `offerExpiresAt` has passed. */
    acceptOffer: (id: string, options?: MutationOptions): Promise<Resource<LoanApplication>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.borrow.acceptOffer(id),
        schema: applicationResource,
      }),

    /** Live loans. */
    list: (query?: ListLoansQuery, options?: QueryOptions): Promise<Paginated<Loan>> =>
      http.get({ ...options, path: routes.borrow.list, query, schema: loanList }),

    /** One loan, with arrears and next payment. */
    get: (id: string, options?: QueryOptions): Promise<Resource<Loan>> =>
      http.get({ ...options, path: routes.borrow.byId(id), schema: loanResource }),

    /** The amortisation schedule, instalment by instalment. */
    schedule: (
      id: string,
      query?: CursorQuery,
      options?: QueryOptions,
    ): Promise<Paginated<AmortisationRow>> =>
      http.get({ ...options, path: routes.borrow.schedule(id), query, schema: scheduleList }),

    /** Makes a repayment or an overpayment. */
    repay: (
      id: string,
      body: RepayLoanRequest,
      options?: MutationOptions,
    ): Promise<Resource<Loan>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.borrow.repay(id),
        body,
        schema: loanResource,
      }),

    /** What settling the loan today would cost, including any early-repayment fee. */
    payoffQuote: (id: string, options?: QueryOptions): Promise<Resource<PayoffQuote>> =>
      http.get({ ...options, path: routes.borrow.payoffQuote(id), schema: payoffResource }),

    /** Asks for an arranged overdraft on an account. */
    requestOverdraft: (
      body: RequestOverdraftRequest,
      options?: MutationOptions,
    ): Promise<Resource<LoanApplication>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.borrow.requestOverdraft,
        body,
        schema: applicationResource,
      }),
  };
}

/** The `client.borrow` group. */
export type BorrowResource = ReturnType<typeof createBorrowResource>;
