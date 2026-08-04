/**
 * Business-banking handlers: team, approvals, invoices and payroll.
 */

import { ErrorCode, routes } from '@reliance/contracts';

import { money } from '../db/money.js';
import { opaqueId } from '../faker.js';

import {
  acknowledged,
  failure,
  MockMethod,
  notFound,
  resourceCreated,
  resourceOk,
  route,
  type MockRoute,
} from './kit.js';
import { paginate } from './paging.js';

/** Business banking. */
export const businessHandlers: readonly MockRoute[] = [
  route(MockMethod.GET, routes.business.members, ({ db, query }) =>
    paginate(db.businessMembers, query),
  ),

  route(MockMethod.POST, routes.business.members, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const member = {
      id: opaqueId(),
      userId: null,
      email: String(input.email ?? 'colleague@example.com'),
      fullName: String(input.fullName ?? 'New colleague'),
      role: (input.role as (typeof db.businessMembers)[number]['role']) ?? 'VIEWER',
      status: 'INVITED' as const,
      accountIds: Array.isArray(input.accountIds) ? (input.accountIds as string[]) : [],
      approvalThreshold: null,
      invitedAt: db.clock.nowIso(),
      joinedAt: null,
      lastActiveAt: null,
    };
    db.businessMembers.push(member);
    return resourceCreated(member);
  }),

  route(MockMethod.GET, routes.business.member(':id'), ({ db, params }) => {
    const member = db.businessMembers.find((candidate) => candidate.id === params.id);
    return member ? resourceOk(member) : notFound('That team member');
  }),

  route(MockMethod.PATCH, routes.business.member(':id'), ({ body, db, params }) => {
    const index = db.businessMembers.findIndex((candidate) => candidate.id === params.id);
    const member = db.businessMembers[index];
    if (index === -1 || !member) return notFound('That team member');
    const updated = { ...member, ...(body as Record<string, unknown>) };
    db.businessMembers[index] = updated;
    return resourceOk(updated);
  }),

  route(MockMethod.DELETE, routes.business.member(':id'), ({ db, params }) => {
    const remaining = db.businessMembers.filter((candidate) => candidate.id !== params.id);
    if (remaining.length === db.businessMembers.length) return notFound('That team member');
    db.businessMembers = remaining;
    return acknowledged();
  }),

  route(MockMethod.GET, routes.business.approvals, ({ db, query }) =>
    paginate(db.businessApprovals, query),
  ),

  route(MockMethod.POST, routes.business.decideApproval(':id'), ({ body, db, params }) => {
    const index = db.businessApprovals.findIndex((candidate) => candidate.id === params.id);
    const approval = db.businessApprovals[index];
    if (index === -1 || !approval) return notFound('That approval');

    const input = (body ?? {}) as Record<string, unknown>;
    const approved = input.decision === 'APPROVE';
    const updated = {
      ...approval,
      status: approved ? ('APPROVED' as const) : ('REJECTED' as const),
      approvedByNames: approved
        ? [...approval.approvedByNames, `${db.currentUser.firstName} ${db.currentUser.lastName}`]
        : approval.approvedByNames,
      decisionNote: typeof input.note === 'string' ? input.note : null,
      decidedAt: db.clock.nowIso(),
    };
    db.businessApprovals[index] = updated;
    return resourceOk(updated);
  }),

  route(MockMethod.GET, routes.business.invoices, ({ db, query }) => {
    const status = query.get('status');
    const search = query.get('search')?.toLowerCase();
    return paginate(
      db.invoices.filter(
        (invoice) =>
          (!status || invoice.status === status) &&
          (!search || invoice.customerName.toLowerCase().includes(search)),
      ),
      query,
      { includeTotal: true },
    );
  }),

  route(MockMethod.POST, routes.business.invoices, ({ body, db }) => {
    const template = db.invoices[0];
    if (!template) return notFound('An invoice template');

    const input = (body ?? {}) as Record<string, unknown>;
    const invoice = {
      ...template,
      id: opaqueId(),
      number: `INV-${String(1000 + db.invoices.length)}`,
      status: 'DRAFT' as const,
      customerName: String(input.customerName ?? template.customerName),
      issuedOn: db.clock.todayIso(),
      createdAt: db.clock.nowIso(),
      paidAt: null,
      amountPaid: money(0),
      amountDue: template.total,
    };
    db.invoices.unshift(invoice);
    return resourceCreated(invoice);
  }),

  route(MockMethod.GET, routes.business.invoice(':id'), ({ db, params }) => {
    const invoice = db.invoices.find((candidate) => candidate.id === params.id);
    return invoice ? resourceOk(invoice) : notFound('That invoice');
  }),

  route(MockMethod.DELETE, routes.business.invoice(':id'), ({ db, params }) => {
    const index = db.invoices.findIndex((candidate) => candidate.id === params.id);
    const invoice = db.invoices[index];
    if (index === -1 || !invoice) return notFound('That invoice');

    if (invoice.status === 'PAID') {
      return failure(
        ErrorCode.PRECONDITION_FAILED,
        'A paid invoice cannot be voided. Raise a credit note instead.',
      );
    }

    const voided = { ...invoice, status: 'VOID' as const };
    db.invoices[index] = voided;
    return resourceOk(voided);
  }),

  route(MockMethod.GET, routes.business.payroll, ({ db, query }) =>
    paginate(db.payrollRuns, query),
  ),

  route(MockMethod.POST, routes.business.payroll, ({ db }) => {
    const template = db.payrollRuns[0];
    if (!template) return notFound('A payroll template');
    const run = {
      ...template,
      id: opaqueId(),
      status: 'AWAITING_APPROVAL' as const,
      createdAt: db.clock.nowIso(),
      completedAt: null,
    };
    db.payrollRuns.unshift(run);
    return resourceCreated(run);
  }),
];
