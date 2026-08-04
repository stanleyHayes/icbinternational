/**
 * Admin: AML, fraud, disputes, cards and lending decisions.
 *
 * `backtestRule` exists so a rule change can be argued about with evidence. Tuning an
 * AML threshold blind either floods the queue with false positives or stops catching
 * anything, and neither failure announces itself for weeks.
 */

import {
  amlAlertSchema,
  amlCaseSchema,
  amlRuleSchema,
  cardSchema,
  disputeSchema,
  loanApplicationSchema,
  loanSchema,
  paginated,
  resource,
  routes,
  type AlertSeverity,
  type AlertStatus,
  type AmlAlert,
  type AmlCase,
  type AmlRule,
  type Card,
  type CursorQuery,
  type Dispute,
  type DisputeStatus,
  type Loan,
  type LoanApplication,
  type LoanApplicationStatus,
  type Paginated,
  type Resource,
} from '@reliance/contracts';

import { withIdempotencyKey } from '../../core/idempotency.js';
import type { HttpTransport } from '../../core/transport.js';
import type { MutationOptions, QueryOptions } from '../../core/types.js';
import {
  fraudRuleSchema,
  ruleBacktestSchema,
  type FraudRule,
  type RuleBacktest,
} from '../../provisional/operations.js';

const alertList = paginated(amlAlertSchema);
const caseList = paginated(amlCaseSchema);
const caseResource = resource(amlCaseSchema);
const ruleList = paginated(amlRuleSchema);
const ruleResource = resource(amlRuleSchema);
const backtestResource = resource(ruleBacktestSchema);
const fraudRuleList = paginated(fraudRuleSchema);
const disputeList = paginated(disputeSchema);
const disputeResource = resource(disputeSchema);
const cardList = paginated(cardSchema);
const applicationList = paginated(loanApplicationSchema);
const applicationResource = resource(loanApplicationSchema);
const loanList = paginated(loanSchema);

/** Filters for the AML alert queue. */
export type AmlAlertQuery = {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly status?: AlertStatus | undefined;
  readonly severity?: AlertSeverity | undefined;
  readonly assignedToId?: string | undefined;
};

/** Filters for the admin dispute queue. */
export type AdminDisputeQuery = {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly status?: DisputeStatus | undefined;
};

/** Filters for the underwriting queue. */
export type LoanQueueQuery = {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly status?: LoanApplicationStatus | undefined;
};

/** Body of an AML case update. */
export interface UpdateAmlCaseRequest {
  readonly status?: string;
  readonly assignedToId?: string;
  readonly disposition?: string;
  readonly note?: string;
}

/** Body of a dispute decision. */
export interface DecideDisputeRequest {
  readonly outcome: 'WON' | 'LOST' | 'WITHDRAWN';
  readonly outcomeSummary: string;
  readonly reverseProvisionalCredit?: boolean;
}

/** Body of a lending decision. */
export interface DecideLoanRequest {
  readonly decision: 'APPROVE' | 'DECLINE' | 'REFER';
  readonly aprBps?: number;
  readonly approvedAmount?: { readonly amount: string; readonly currency: string };
  readonly reasons?: readonly string[];
  readonly note: string;
}

/** Builds the risk half of `client.admin`. */
export function createAdminRiskResource(http: HttpTransport) {
  return {
    /** The AML alert queue. */
    amlAlerts: (query?: AmlAlertQuery, options?: QueryOptions): Promise<Paginated<AmlAlert>> =>
      http.get({ ...options, path: routes.admin.amlAlerts, query, schema: alertList }),

    /** Investigation cases. */
    amlCases: (query?: CursorQuery, options?: QueryOptions): Promise<Paginated<AmlCase>> =>
      http.get({ ...options, path: routes.admin.amlCases, query, schema: caseList }),

    /** One case, with its alerts, notes and evidence. */
    amlCase: (id: string, options?: QueryOptions): Promise<Resource<AmlCase>> =>
      http.get({ ...options, path: routes.admin.amlCase(id), schema: caseResource }),

    /** Advances a case: assign, note, dispose. */
    updateAmlCase: (
      id: string,
      body: UpdateAmlCaseRequest,
      options?: MutationOptions,
    ): Promise<Resource<AmlCase>> =>
      http.patch({ ...options, path: routes.admin.amlCase(id), body, schema: caseResource }),

    /** AML rules and how each is performing. */
    amlRules: (query?: CursorQuery, options?: QueryOptions): Promise<Paginated<AmlRule>> =>
      http.get({ ...options, path: routes.admin.amlRules, query, schema: ruleList }),

    /** Creates a rule. Start it disabled and backtest before switching it on. */
    createAmlRule: (
      body: Partial<AmlRule>,
      options?: MutationOptions,
    ): Promise<Resource<AmlRule>> =>
      http.post({ ...options, path: routes.admin.amlRules, body, schema: ruleResource }),

    /** One rule. */
    amlRule: (id: string, options?: QueryOptions): Promise<Resource<AmlRule>> =>
      http.get({ ...options, path: routes.admin.amlRule(id), schema: ruleResource }),

    /** Retunes a rule. */
    updateAmlRule: (
      id: string,
      body: Partial<AmlRule>,
      options?: MutationOptions,
    ): Promise<Resource<AmlRule>> =>
      http.patch({ ...options, path: routes.admin.amlRule(id), body, schema: ruleResource }),

    /** Replays a rule over history to see what it would have caught. Changes nothing. */
    backtestRule: (
      id: string,
      body: { readonly windowDays: number },
      options?: MutationOptions,
    ): Promise<Resource<RuleBacktest>> =>
      http.post({
        ...options,
        path: routes.admin.backtestRule(id),
        body,
        schema: backtestResource,
      }),

    /** Fraud rules. */
    fraudRules: (query?: CursorQuery, options?: QueryOptions): Promise<Paginated<FraudRule>> =>
      http.get({ ...options, path: routes.admin.fraudRules, query, schema: fraudRuleList }),

    /** Enables, disables or retunes a fraud rule. */
    updateFraudRules: (
      body: readonly Partial<FraudRule>[],
      options?: MutationOptions,
    ): Promise<Paginated<FraudRule>> =>
      http.put({ ...options, path: routes.admin.fraudRules, body, schema: fraudRuleList }),

    /** The dispute queue. */
    disputes: (query?: AdminDisputeQuery, options?: QueryOptions): Promise<Paginated<Dispute>> =>
      http.get({ ...options, path: routes.admin.disputes, query, schema: disputeList }),

    /** One dispute, from the bank's side. */
    dispute: (id: string, options?: QueryOptions): Promise<Resource<Dispute>> =>
      http.get({ ...options, path: routes.admin.dispute(id), schema: disputeResource }),

    /** Decides a dispute. Posts real ledger entries, so it is idempotency-keyed. */
    decideDispute: (
      id: string,
      body: DecideDisputeRequest,
      options?: MutationOptions,
    ): Promise<Resource<Dispute>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.admin.dispute(id),
        body,
        schema: disputeResource,
      }),

    /** Every card in the bank, for fraud and support work. */
    cards: (query?: CursorQuery, options?: QueryOptions): Promise<Paginated<Card>> =>
      http.get({ ...options, path: routes.admin.cards, query, schema: cardList }),

    /** The underwriting queue. */
    loanApplications: (
      query?: LoanQueueQuery,
      options?: QueryOptions,
    ): Promise<Paginated<LoanApplication>> =>
      http.get({
        ...options,
        path: routes.admin.loanApplications,
        query,
        schema: applicationList,
      }),

    /** Approves, declines or refers an application. */
    decideLoan: (
      id: string,
      body: DecideLoanRequest,
      options?: MutationOptions,
    ): Promise<Resource<LoanApplication>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.admin.decideLoan(id),
        body,
        schema: applicationResource,
      }),

    /** Loans in arrears, worst first. */
    arrears: (query?: CursorQuery, options?: QueryOptions): Promise<Paginated<Loan>> =>
      http.get({ ...options, path: routes.admin.arrears, query, schema: loanList }),
  };
}

/** The risk half of `client.admin`. */
export type AdminRiskResource = ReturnType<typeof createAdminRiskResource>;
