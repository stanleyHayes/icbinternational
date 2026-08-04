/**
 * Admin handlers: AML, fraud, disputes, cards and lending decisions.
 */

import {
  DisputeStatus,
  ErrorCode,
  LoanApplicationStatus,
  routes,
  type AmlRule,
  type Dispute,
} from '@reliance/contracts';

import { opaqueId } from '../faker.js';

import {
  failure,
  MockMethod,
  notFound,
  resourceCreated,
  resourceOk,
  route,
  type MockRoute,
} from './kit.js';
import { paginate } from './paging.js';

const DEFAULT_BACKTEST_DAYS = 90;
const SAMPLE_SIZE = 5;

/** What each dispute outcome does to the case's status. */
const DISPUTE_OUTCOME_STATUS: Record<string, DisputeStatus> = {
  WON: DisputeStatus.WON,
  LOST: DisputeStatus.LOST,
  WITHDRAWN: DisputeStatus.WITHDRAWN,
};

/** What each underwriting decision does to the application's status. */
const LOAN_DECISION_STATUS: Record<string, LoanApplicationStatus> = {
  APPROVE: LoanApplicationStatus.APPROVED,
  DECLINE: LoanApplicationStatus.DECLINED,
  REFER: LoanApplicationStatus.REFERRED,
};

/** AML, fraud, disputes, cards and lending. */
export const adminRiskHandlers: readonly MockRoute[] = [
  route(MockMethod.GET, routes.admin.amlAlerts, ({ db, query }) => {
    const status = query.get('status');
    const severity = query.get('severity');
    return paginate(
      db.amlAlerts.filter(
        (alert) =>
          (!status || alert.status === status) && (!severity || alert.severity === severity),
      ),
      query,
      { includeTotal: true },
    );
  }),

  route(MockMethod.GET, routes.admin.amlCases, ({ db, query }) =>
    paginate(db.amlCases, query, { includeTotal: true }),
  ),

  route(MockMethod.GET, routes.admin.amlRules, ({ db, query }) =>
    paginate(db.amlRules, query, { includeTotal: true }),
  ),

  route(MockMethod.POST, routes.admin.amlRules, ({ body, db }) => {
    const template = db.amlRules[0];
    if (!template) return notFound('An AML rule template');
    const created: AmlRule = {
      ...template,
      ...(body as Partial<AmlRule>),
      id: opaqueId(),
      // New rules start disabled. Enabling an untested rule against live traffic is how
      // an alert queue goes from forty a day to four thousand overnight.
      enabled: false,
      alertsLast30Days: 0,
      updatedAt: db.clock.nowIso(),
    };
    db.amlRules.unshift(created);
    return resourceCreated(created);
  }),

  route(MockMethod.POST, routes.admin.backtestRule(':id'), ({ body, db, params }) => {
    const rule = db.amlRules.find((candidate) => candidate.id === params.id);
    if (!rule) return notFound('That rule');

    const input = (body ?? {}) as Record<string, unknown>;
    const windowDays = Number(input.windowDays ?? DEFAULT_BACKTEST_DAYS);
    const evaluated = db.transactions.length;
    const wouldAlert = Math.max(Math.floor(evaluated / 50), 1);

    return resourceOk({
      ruleId: rule.id,
      windowDays,
      transactionsEvaluated: evaluated,
      wouldHaveAlerted: wouldAlert,
      matchedExistingAlerts: Math.min(wouldAlert, db.amlAlerts.length),
      estimatedFalsePositiveRateBps: rule.falsePositiveRateBps,
      sampleTransactionIds: db.transactions.slice(0, SAMPLE_SIZE).map((t) => t.id),
      ranAt: db.clock.nowIso(),
    });
  }),

  route(MockMethod.GET, routes.admin.amlRule(':id'), ({ db, params }) => {
    const rule = db.amlRules.find((candidate) => candidate.id === params.id);
    return rule ? resourceOk(rule) : notFound('That rule');
  }),

  route(MockMethod.PATCH, routes.admin.amlRule(':id'), ({ body, db, params }) => {
    const index = db.amlRules.findIndex((candidate) => candidate.id === params.id);
    const rule = db.amlRules[index];
    if (index === -1 || !rule) return notFound('That rule');
    const updated = { ...rule, ...(body as Partial<AmlRule>), updatedAt: db.clock.nowIso() };
    db.amlRules[index] = updated;
    return resourceOk(updated);
  }),

  route(MockMethod.GET, routes.admin.amlCase(':id'), ({ db, params }) => {
    const amlCase = db.amlCases.find((candidate) => candidate.id === params.id);
    return amlCase ? resourceOk(amlCase) : notFound('That case');
  }),

  route(MockMethod.PATCH, routes.admin.amlCase(':id'), ({ body, db, params }) => {
    const index = db.amlCases.findIndex((candidate) => candidate.id === params.id);
    const amlCase = db.amlCases[index];
    if (index === -1 || !amlCase) return notFound('That case');

    const input = (body ?? {}) as Record<string, unknown>;
    const updated = {
      ...amlCase,
      status: (input.status as (typeof amlCase)['status']) ?? amlCase.status,
      assignedToId:
        typeof input.assignedToId === 'string' ? input.assignedToId : amlCase.assignedToId,
      disposition: (input.disposition as (typeof amlCase)['disposition']) ?? amlCase.disposition,
      notes:
        typeof input.note === 'string'
          ? [
              ...amlCase.notes,
              {
                authorName: db.adminUsers[0]?.fullName ?? 'An analyst',
                body: input.note,
                at: db.clock.nowIso(),
              },
            ]
          : amlCase.notes,
    };
    db.amlCases[index] = updated;
    return resourceOk(updated);
  }),

  route(MockMethod.GET, routes.admin.fraudRules, ({ db, query }) =>
    paginate(db.fraudRules, query, { includeTotal: true }),
  ),

  route(MockMethod.PUT, routes.admin.fraudRules, ({ body, db }) => {
    const submitted = Array.isArray(body)
      ? (body as Partial<(typeof db.fraudRules)[number]>[])
      : [];
    db.fraudRules = db.fraudRules.map((rule) => {
      const change = submitted.find((candidate) => candidate.id === rule.id);
      return change ? { ...rule, ...change, updatedAt: db.clock.nowIso() } : rule;
    });
    return paginate(db.fraudRules, new URLSearchParams());
  }),

  route(MockMethod.GET, routes.admin.disputes, ({ db, query }) => {
    const status = query.get('status');
    return paginate(
      db.disputes.filter((dispute) => !status || dispute.status === status),
      query,
      { includeTotal: true },
    );
  }),

  route(MockMethod.GET, routes.admin.dispute(':id'), ({ db, params }) => {
    const dispute = db.disputes.find((candidate) => candidate.id === params.id);
    return dispute ? resourceOk(dispute) : notFound('That dispute');
  }),

  route(MockMethod.POST, routes.admin.dispute(':id'), ({ body, db, params }) => {
    const index = db.disputes.findIndex((candidate) => candidate.id === params.id);
    const dispute = db.disputes[index];
    if (index === -1 || !dispute) return notFound('That dispute');

    const input = (body ?? {}) as Record<string, unknown>;
    const outcome = String(input.outcome ?? 'WON');
    const status = DISPUTE_OUTCOME_STATUS[outcome] ?? DisputeStatus.WON;

    const decided: Dispute = {
      ...dispute,
      status,
      outcomeSummary: typeof input.outcomeSummary === 'string' ? input.outcomeSummary : null,
      // A lost dispute reverses the provisional credit. Leaving it in place would show
      // the customer money they no longer have.
      provisionalCredit: status === DisputeStatus.LOST ? null : dispute.provisionalCredit,
      resolvedAt: db.clock.nowIso(),
      timeline: [
        ...dispute.timeline,
        { status, at: db.clock.nowIso(), detail: `Decision: ${outcome}` },
      ],
    };
    db.disputes[index] = decided;
    return resourceOk(decided);
  }),

  route(MockMethod.GET, routes.admin.cards, ({ db, query }) =>
    paginate(db.cards, query, { includeTotal: true }),
  ),

  route(MockMethod.GET, routes.admin.loanApplications, ({ db, query }) => {
    const status = query.get('status');
    return paginate(
      db.loanApplications.filter((application) => !status || application.status === status),
      query,
      { includeTotal: true },
    );
  }),

  route(MockMethod.POST, routes.admin.decideLoan(':id'), ({ body, db, params }) => {
    const index = db.loanApplications.findIndex((candidate) => candidate.id === params.id);
    const application = db.loanApplications[index];
    if (index === -1 || !application) return notFound('That application');

    const input = (body ?? {}) as Record<string, unknown>;
    if (typeof input.note !== 'string' || input.note.trim().length === 0) {
      return failure(ErrorCode.VALIDATION_FAILED, 'A decision note is required.', {
        details: [{ path: 'note', message: 'must not be empty' }],
      });
    }

    const decision = String(input.decision ?? 'APPROVE');
    const status = LOAN_DECISION_STATUS[decision] ?? LoanApplicationStatus.APPROVED;

    const decided = {
      ...application,
      status,
      declineReasons: Array.isArray(input.reasons) ? (input.reasons as string[]) : [],
      decidedAt: db.clock.nowIso(),
    };
    db.loanApplications[index] = decided;
    return resourceOk(decided);
  }),

  route(MockMethod.GET, routes.admin.arrears, ({ db, query }) =>
    paginate(
      db.loans.filter((loan) => loan.daysPastDue > 0 || loan.status === 'IN_ARREARS'),
      query,
      { includeTotal: true },
    ),
  ),
];
