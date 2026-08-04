/**
 * Admin handlers: staff identity, customers, KYC adjudication and screening.
 */

import { ErrorCode, KycStatus, routes, UserStatus, type AdminRole } from '@reliance/contracts';

import { opaqueId } from '../faker.js';

import {
  acknowledged,
  failure,
  MockMethod,
  notFound,
  resourceOk,
  route,
  type MockRoute,
} from './kit.js';
import { paginate } from './paging.js';

const IMPERSONATION_MINUTES = 30;

/** What each adjudication decision does to the case's status. */
const KYC_DECISION_STATUS: Record<string, KycStatus> = {
  APPROVE: KycStatus.APPROVED,
  REJECT: KycStatus.REJECTED,
  REQUEST_MORE_INFO: KycStatus.MORE_INFO_REQUIRED,
};

/** Customers, KYC and screening. */
export const adminCustomerHandlers: readonly MockRoute[] = [
  route(MockMethod.POST, routes.admin.login, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    if (!input.totpCode) {
      return failure(ErrorCode.MFA_REQUIRED, 'Staff sign-in always needs a second factor.');
    }
    const admin = db.adminUsers[0];
    return admin ? resourceOk(admin) : notFound('That staff account');
  }),

  route(MockMethod.GET, routes.admin.me, ({ db }) => {
    const admin = db.adminUsers[0];
    return admin ? resourceOk(admin) : notFound('That staff account');
  }),

  route(MockMethod.GET, routes.admin.customers, ({ db, query }) => {
    const search = query.get('search')?.toLowerCase();
    const status = query.get('status');
    const kycTier = query.get('kycTier');

    return paginate(
      db.users.filter(
        (user) =>
          (!status || user.status === status) &&
          (!kycTier || user.kycTier === Number(kycTier)) &&
          (!search ||
            user.email.includes(search) ||
            `${user.firstName} ${user.lastName}`.toLowerCase().includes(search)),
      ),
      query,
      { includeTotal: true },
    );
  }),

  route(MockMethod.POST, routes.admin.freezeCustomer(':id'), ({ body, db, params }) => {
    const index = db.users.findIndex((candidate) => candidate.id === params.id);
    const user = db.users[index];
    if (index === -1 || !user) return notFound('That customer');

    const input = (body ?? {}) as Record<string, unknown>;
    if (typeof input.reason !== 'string' || input.reason.trim().length === 0) {
      return failure(ErrorCode.VALIDATION_FAILED, 'A reason is required.', {
        details: [{ path: 'reason', message: 'must not be empty' }],
      });
    }

    const updated = {
      ...user,
      status: input.frozen === false ? UserStatus.ACTIVE : UserStatus.SUSPENDED,
    };
    db.users[index] = updated;
    if (updated.id === db.currentUser.id) db.currentUser = updated;
    return resourceOk(updated);
  }),

  route(MockMethod.POST, routes.admin.impersonate(':id'), ({ body, db, params }) => {
    const user = db.users.find((candidate) => candidate.id === params.id);
    if (!user) return notFound('That customer');

    const input = (body ?? {}) as Record<string, unknown>;
    const justification = typeof input.justification === 'string' ? input.justification : '';
    if (justification.trim().length === 0) {
      return failure(
        ErrorCode.VALIDATION_FAILED,
        'Impersonation requires a written justification.',
        { details: [{ path: 'justification', message: 'must not be empty' }] },
      );
    }

    return resourceOk({
      token: opaqueId(),
      userId: user.id,
      justification,
      readOnly: input.readOnly !== false,
      expiresAt: db.clock.minutesAhead(IMPERSONATION_MINUTES),
      issuedAt: db.clock.nowIso(),
    });
  }),

  route(MockMethod.GET, routes.admin.customer(':id'), ({ db, params }) => {
    const user = db.users.find((candidate) => candidate.id === params.id);
    return user ? resourceOk(user) : notFound('That customer');
  }),

  route(MockMethod.GET, routes.admin.kycQueue, ({ db, query }) => {
    const status = query.get('status');
    return paginate(
      [db.kycCase].filter((kycCase) => !status || kycCase.status === status),
      query,
      { includeTotal: true },
    );
  }),

  route(MockMethod.POST, routes.admin.decideKyc(':id'), ({ body, db, params }) => {
    if (db.kycCase.id !== params.id) return notFound('That KYC case');

    const input = (body ?? {}) as Record<string, unknown>;
    const decision = String(input.decision ?? 'APPROVE');
    const status = KYC_DECISION_STATUS[decision] ?? KycStatus.APPROVED;

    db.kycCase = {
      ...db.kycCase,
      status,
      currentTier:
        status === KycStatus.APPROVED
          ? Number(input.grantedTier ?? db.kycCase.requestedTier)
          : db.kycCase.currentTier,
      reviewerMessage: typeof input.reviewerMessage === 'string' ? input.reviewerMessage : null,
      decidedAt: db.clock.nowIso(),
      updatedAt: db.clock.nowIso(),
    };
    return resourceOk(db.kycCase);
  }),

  route(MockMethod.GET, routes.admin.kycCase(':id'), ({ db, params }) =>
    db.kycCase.id === params.id ? resourceOk(db.kycCase) : notFound('That KYC case'),
  ),

  route(MockMethod.GET, routes.admin.screeningHits, ({ db, query }) => {
    const status = query.get('status');
    return paginate(
      db.screeningHits.filter((hit) => !status || hit.status === status),
      query,
      { includeTotal: true },
    );
  }),

  route(MockMethod.PATCH, routes.admin.screeningHits, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const index = db.screeningHits.findIndex((hit) => hit.id === input.hitId);
    const hit = db.screeningHits[index];
    if (index === -1 || !hit) return notFound('That screening hit');

    db.screeningHits[index] = {
      ...hit,
      status: (input.status as (typeof hit)['status']) ?? hit.status,
      decidedAt: db.clock.nowIso(),
    };
    return acknowledged();
  }),

  route(MockMethod.GET, routes.admin.users, ({ db, query }) => paginate(db.adminUsers, query)),

  route(MockMethod.POST, routes.admin.users, ({ body, db }) => {
    const template = db.adminUsers[0];
    if (!template) return notFound('A staff template');
    const input = (body ?? {}) as Record<string, unknown>;
    const created = {
      ...template,
      id: `adm_${opaqueId().toUpperCase().padEnd(26, 'A').slice(0, 26)}`,
      email: String(input.email ?? 'new.staff@reliance.test'),
      fullName: String(input.fullName ?? 'New staff member'),
      roles: (input.roles as AdminRole[]) ?? template.roles,
      createdAt: db.clock.nowIso(),
      lastLoginAt: null,
    };
    db.adminUsers.push(created);
    return resourceOk(created);
  }),

  route(MockMethod.GET, routes.admin.user(':id'), ({ db, params }) => {
    const admin = db.adminUsers.find((candidate) => candidate.id === params.id);
    return admin ? resourceOk(admin) : notFound('That staff account');
  }),

  route(MockMethod.PATCH, routes.admin.user(':id'), ({ body, db, params }) => {
    const index = db.adminUsers.findIndex((candidate) => candidate.id === params.id);
    const admin = db.adminUsers[index];
    if (index === -1 || !admin) return notFound('That staff account');
    const updated = { ...admin, ...(body as Partial<typeof admin>) };
    db.adminUsers[index] = updated;
    return resourceOk(updated);
  }),

  route(MockMethod.GET, routes.admin.roles, ({ db, query }) =>
    paginate(
      db.adminRoles.map((definition) => ({ ...definition, id: definition.role })),
      query,
    ),
  ),
];
