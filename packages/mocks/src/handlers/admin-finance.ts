/**
 * Admin handlers: ledger, postings, holds, approvals and financial reports.
 *
 * The trial balance is computed from the mock's own accounts rather than being a fixed
 * fixture, so it foots. A console that shows a non-zero difference because the mock made
 * one up teaches its operator to ignore the one number that must never be ignored.
 */

import {
  ApprovalStatus,
  ErrorCode,
  LedgerAccountType,
  routes,
  type ApprovalRequest,
} from '@reliance/contracts';

import { minorUnits, money, subtractMoney, sumMoney, zero } from '../db/money.js';
import type { MockDatabase } from '../db/types.js';
import { makeHold } from '../factories/banking.js';
import { makeApprovalRequest } from '../factories/operations.js';
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
import { readMoney } from './read-body.js';

const CUSTOMER_DEPOSITS_CODE = '2100';
const CASH_AT_BANK_CODE = '1000';

/** Ledger, approvals, holds and reports. */
export const adminFinanceHandlers: readonly MockRoute[] = [
  route(MockMethod.GET, routes.admin.transactions, ({ db, query }) =>
    paginate(db.transactions, query, { includeTotal: true }),
  ),

  route(MockMethod.GET, routes.admin.journalEntries, ({ db, query }) => {
    const type = query.get('type');
    return paginate(
      db.journalEntries.filter((entry) => !type || entry.type === type),
      query,
      { includeTotal: true },
    );
  }),

  route(MockMethod.GET, routes.admin.journalEntry(':id'), ({ db, params }) => {
    const entry = db.journalEntries.find((candidate) => candidate.id === params.id);
    return entry ? resourceOk(entry) : notFound('That journal entry');
  }),

  /**
   * A manual posting raises an approval; it does not post.
   *
   * One admin who can move money between accounts unilaterally is the whole reason dual
   * control exists, so the mock refuses to shortcut it too.
   */
  route(MockMethod.POST, routes.admin.manualPostings, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const justification = typeof input.justification === 'string' ? input.justification : '';
    if (justification.trim().length === 0) {
      return failure(ErrorCode.VALIDATION_FAILED, 'A justification is required.', {
        details: [{ path: 'justification', message: 'must not be empty' }],
      });
    }

    const approval = makeApprovalRequest({
      clock: db.clock,
      overrides: {
        id: opaqueId(),
        kind: 'MANUAL_POSTING',
        status: ApprovalStatus.PENDING,
        amount: readMoney(body, 'amount') ?? zero(),
        justification,
        payload: input,
        createdAt: db.clock.nowIso(),
      },
    });
    db.approvals.unshift(approval);
    return resourceCreated(approval);
  }),

  route(MockMethod.GET, routes.admin.approvals, ({ db, query }) => {
    const status = query.get('status');
    return paginate(
      db.approvals.filter((approval) => !status || approval.status === status),
      query,
      { includeTotal: true },
    );
  }),

  route(MockMethod.POST, routes.admin.decideApproval(':id'), ({ body, db, params }) => {
    const index = db.approvals.findIndex((candidate) => candidate.id === params.id);
    const approval = db.approvals[index];
    if (index === -1 || !approval) return notFound('That approval');

    const decider = db.adminUsers[0];
    if (decider && decider.id === approval.initiatedBy.id) {
      return failure(
        ErrorCode.SELF_APPROVAL_FORBIDDEN,
        'The admin who raised this cannot also approve it.',
      );
    }

    const input = (body ?? {}) as Record<string, unknown>;
    const decided: ApprovalRequest = {
      ...approval,
      status: input.decision === 'REJECT' ? ApprovalStatus.REJECTED : ApprovalStatus.APPROVED,
      decidedBy: decider ? { id: decider.id, name: decider.fullName } : null,
      decisionNote: typeof input.note === 'string' ? input.note : null,
      decidedAt: db.clock.nowIso(),
    };
    db.approvals[index] = decided;
    return resourceOk(decided);
  }),

  route(MockMethod.GET, routes.admin.holds, ({ db, query }) =>
    paginate(db.holds, query, { includeTotal: true }),
  ),

  route(MockMethod.POST, routes.admin.holds, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const accountId = String(input.accountId ?? '');
    if (!db.accounts.some((account) => account.id === accountId)) {
      return failure(ErrorCode.ACCOUNT_NOT_FOUND, 'That account was not found.');
    }

    const hold = makeHold({
      clock: db.clock,
      accountId,
      overrides: {
        amount: readMoney(body, 'amount') ?? money(0),
        reason: (input.reason as ReturnType<typeof makeHold>['reason']) ?? 'MANUAL_LIEN',
        description: String(input.description ?? 'Manual hold'),
        placedAt: db.clock.nowIso(),
      },
    });
    db.holds.unshift(hold);
    return resourceCreated(hold);
  }),

  route(MockMethod.GET, routes.admin.trialBalance, ({ db }) => {
    const deposits = sumMoney(
      db.accounts.filter((a) => a.currency === 'GBP').map((account) => account.balance.ledger),
    );

    // The bank's cash asset mirrors the customer liability exactly, which is what makes
    // the difference zero. That is the whole assertion this screen exists to make.
    return resourceOk({
      currency: 'GBP',
      asOf: db.clock.nowIso(),
      lines: [
        {
          code: CASH_AT_BANK_CODE,
          name: 'Cash at bank',
          type: LedgerAccountType.ASSET,
          debit: deposits,
          credit: zero(),
        },
        {
          code: CUSTOMER_DEPOSITS_CODE,
          name: 'Customer deposits',
          type: LedgerAccountType.LIABILITY,
          debit: zero(),
          credit: deposits,
        },
      ],
      totalDebits: deposits,
      totalCredits: deposits,
      difference: subtractMoney(deposits, deposits),
      balanced: true,
    });
  }),

  route(MockMethod.GET, routes.admin.generalLedger, ({ db }) =>
    resourceOk(report(db, 'GENERAL_LEDGER')),
  ),
  route(MockMethod.GET, routes.admin.profitAndLoss, ({ db }) =>
    resourceOk(report(db, 'PROFIT_AND_LOSS')),
  ),
  route(MockMethod.GET, routes.admin.balanceSheet, ({ db }) =>
    resourceOk(report(db, 'BALANCE_SHEET')),
  ),

  route(MockMethod.GET, routes.admin.reconciliation, ({ db }) => {
    const internal = sumMoney(
      db.transfers.map((transfer) => transfer.debitAmount).filter((a) => a.currency === 'GBP'),
    );
    return resourceOk({
      rail: 'DOMESTIC_ACH',
      periodStart: db.clock.dateDaysAgo(1),
      periodEnd: db.clock.todayIso(),
      internalTotal: internal,
      externalTotal: internal,
      difference: zero(),
      matchedCount: db.transfers.length,
      unmatched: [],
      reconciled: true,
      generatedAt: db.clock.nowIso(),
    });
  }),

  route(MockMethod.GET, routes.admin.audit, ({ db, query }) => {
    const action = query.get('action');
    const entity = query.get('entity');
    return paginate(
      db.auditEvents.filter(
        (event) => (!action || event.action === action) && (!entity || event.entity === entity),
      ),
      query,
      { includeTotal: true },
    );
  }),

  /**
   * Walks the hash chain for real.
   *
   * The fixture builder links each event's `previousHash` to the one before it, so this
   * genuinely detects a tampered row rather than always answering "verified".
   */
  route(MockMethod.POST, routes.admin.verifyAuditChain, ({ db }) => {
    let previousHash = 'genesis';
    let firstBrokenSequence: number | null = null;

    for (const event of db.auditEvents) {
      if (event.previousHash !== previousHash) {
        firstBrokenSequence = event.sequence;
        break;
      }
      previousHash = event.hash;
    }

    return {
      status: 200,
      body: {
        data: {
          verified: firstBrokenSequence === null,
          eventsChecked: db.auditEvents.length,
          firstBrokenSequence,
          checkedAt: db.clock.nowIso(),
        },
      },
    };
  }),
];

type ReportKind = 'GENERAL_LEDGER' | 'PROFIT_AND_LOSS' | 'BALANCE_SHEET';

function report(db: MockDatabase, kind: ReportKind) {
  const total = sumMoney(db.accounts.map((account) => account.balance.ledger));

  return {
    report: kind,
    currency: 'GBP',
    periodStart: db.clock.dateDaysAgo(30),
    periodEnd: db.clock.todayIso(),
    lines: [
      {
        code: CASH_AT_BANK_CODE,
        label: 'Cash at bank',
        amount: total,
        depth: 0,
        isSubtotal: false,
        comparativeAmount: null,
      },
      {
        code: CUSTOMER_DEPOSITS_CODE,
        label: 'Customer deposits',
        amount: money(-minorUnits(total)),
        depth: 0,
        isSubtotal: false,
        comparativeAmount: null,
      },
    ],
    total: zero(),
    balanced: true,
    generatedAt: db.clock.nowIso(),
  };
}
