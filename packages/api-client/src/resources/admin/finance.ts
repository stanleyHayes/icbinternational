/**
 * Admin: the ledger, manual postings, holds and financial reports.
 *
 * `manualPosting` does not post anything. It raises an approval request, because a
 * single admin who can move money between accounts unilaterally is the whole reason
 * dual control exists. The posting happens when a *different* admin approves it.
 */

import {
  approvalRequestSchema,
  holdSchema,
  journalEntrySchema,
  paginated,
  resource,
  routes,
  transactionSchema,
  trialBalanceSchema,
  type ApprovalRequest,
  type ApprovalStatus,
  type CursorQuery,
  type EntryType,
  type Hold,
  type JournalEntry,
  type ListTransactionsQuery,
  type ManualPostingRequest,
  type Paginated,
  type Resource,
  type Transaction,
  type TrialBalance,
} from '@reliance/contracts';

import { withIdempotencyKey } from '../../core/idempotency.js';
import type { HttpTransport } from '../../core/transport.js';
import type { MutationOptions, QueryOptions } from '../../core/types.js';
import {
  financialReportSchema,
  reconciliationReportSchema,
  type FinancialReport,
  type ReconciliationReport,
} from '../../provisional/operations.js';

const transactionList = paginated(transactionSchema);
const journalList = paginated(journalEntrySchema);
const journalResource = resource(journalEntrySchema);
const approvalList = paginated(approvalRequestSchema);
const approvalResource = resource(approvalRequestSchema);
const holdList = paginated(holdSchema);
const holdResource = resource(holdSchema);
const trialBalanceResource = resource(trialBalanceSchema);
const reportResource = resource(financialReportSchema);
const reconciliationResource = resource(reconciliationReportSchema);

/** Filters for the journal. */
export type JournalQuery = {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly type?: EntryType | undefined;
  readonly accountId?: string | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
};

/** Filters for the approval queue. */
export type ApprovalQueueQuery = {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly status?: ApprovalStatus | undefined;
  readonly kind?: string | undefined;
};

/** Window and currency for a report. */
export type ReportQuery = {
  readonly currency?: string | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly comparative?: boolean | undefined;
};

/** Body of a manual hold. */
export interface PlaceHoldRequest {
  readonly accountId: string;
  readonly amount: { readonly amount: string; readonly currency: string };
  readonly reason: string;
  readonly description: string;
  readonly expiresAt?: string;
}

/** Body of an approval decision. */
export interface DecideApprovalRequest {
  readonly decision: 'APPROVE' | 'REJECT';
  readonly note: string;
}

/** Builds the finance half of `client.admin`. */
export function createAdminFinanceResource(http: HttpTransport) {
  return {
    /** Every transaction in the bank, filterable. */
    transactions: (
      query?: ListTransactionsQuery,
      options?: QueryOptions,
    ): Promise<Paginated<Transaction>> =>
      http.get({ ...options, path: routes.admin.transactions, query, schema: transactionList }),

    /** The journal — the actual system of record beneath the customer view. */
    journalEntries: (
      query?: JournalQuery,
      options?: QueryOptions,
    ): Promise<Paginated<JournalEntry>> =>
      http.get({ ...options, path: routes.admin.journalEntries, query, schema: journalList }),

    /** One journal entry, with every posting on it. Immutable by construction. */
    journalEntry: (id: string, options?: QueryOptions): Promise<Resource<JournalEntry>> =>
      http.get({ ...options, path: routes.admin.journalEntry(id), schema: journalResource }),

    /** Raises a manual posting for a second admin to approve. Nothing posts yet. */
    manualPosting: (
      body: ManualPostingRequest,
      options?: MutationOptions,
    ): Promise<Resource<ApprovalRequest>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.admin.manualPostings,
        body,
        schema: approvalResource,
      }),

    /** The dual-control queue. */
    approvals: (
      query?: ApprovalQueueQuery,
      options?: QueryOptions,
    ): Promise<Paginated<ApprovalRequest>> =>
      http.get({ ...options, path: routes.admin.approvals, query, schema: approvalList }),

    /** Approves or rejects. The API refuses a decision from the initiating admin. */
    decideApproval: (
      id: string,
      body: DecideApprovalRequest,
      options?: MutationOptions,
    ): Promise<Resource<ApprovalRequest>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.admin.decideApproval(id),
        body,
        schema: approvalResource,
      }),

    /** Holds and liens across the bank. */
    holds: (query?: CursorQuery, options?: QueryOptions): Promise<Paginated<Hold>> =>
      http.get({ ...options, path: routes.admin.holds, query, schema: holdList }),

    /** Places a manual hold — a court order, a compliance freeze. */
    placeHold: (body: PlaceHoldRequest, options?: MutationOptions): Promise<Resource<Hold>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.admin.holds,
        body,
        schema: holdResource,
      }),

    /**
     * The trial balance. `difference` must be zero.
     *
     * If it is not, the ledger has lost its double-entry guarantee and every other
     * number in this console is suspect. Stop the bank.
     */
    trialBalance: (query?: ReportQuery, options?: QueryOptions): Promise<Resource<TrialBalance>> =>
      http.get({
        ...options,
        path: routes.admin.trialBalance,
        query,
        schema: trialBalanceResource,
      }),

    /** The general ledger over a period. */
    generalLedger: (
      query?: ReportQuery,
      options?: QueryOptions,
    ): Promise<Resource<FinancialReport>> =>
      http.get({ ...options, path: routes.admin.generalLedger, query, schema: reportResource }),

    /** Profit and loss. */
    profitAndLoss: (
      query?: ReportQuery,
      options?: QueryOptions,
    ): Promise<Resource<FinancialReport>> =>
      http.get({ ...options, path: routes.admin.profitAndLoss, query, schema: reportResource }),

    /** Balance sheet. */
    balanceSheet: (
      query?: ReportQuery,
      options?: QueryOptions,
    ): Promise<Resource<FinancialReport>> =>
      http.get({ ...options, path: routes.admin.balanceSheet, query, schema: reportResource }),

    /** Internal ledger against external rail statements, with the exceptions listed. */
    reconciliation: (
      query?: ReportQuery,
      options?: QueryOptions,
    ): Promise<Resource<ReconciliationReport>> =>
      http.get({
        ...options,
        path: routes.admin.reconciliation,
        query,
        schema: reconciliationResource,
      }),
  };
}

/** The finance half of `client.admin`. */
export type AdminFinanceResource = ReturnType<typeof createAdminFinanceResource>;
