import 'reflect-metadata';

import { AUDITED_METADATA, type AuditedOptions } from '../../audit/index.js';
import { IDEMPOTENT_METADATA } from '../../idempotency/index.js';
import { AdminArrearsController } from '../admin-arrears.controller.js';
import { AdminLoansController } from '../admin-loans.controller.js';
import { LoanApplicationsController } from '../loan-applications.controller.js';
import { LoansController } from '../loans.controller.js';

/**
 * Every route in this module that moves money or changes a customer's record.
 *
 * Both interceptors are registered globally and both are inert without their decorator, so
 * a handler that forgets one is not refused at boot and does not fail a smoke test — it
 * simply has no replay protection, or leaves no trail, and nobody finds out until a
 * customer is charged twice or an investigator opens an empty audit log. `POST
 * /loans/:id/repay`, `POST /loans/applications` and `POST /loans/applications/:id/accept`
 * had neither.
 *
 * A checklist in a review comment does not survive the next handler somebody adds. This
 * does: the list below is the module's inventory of value-bearing routes, and adding one
 * without its decorators fails here.
 *
 * `@Idempotent()` is not universal, and the two exclusions are deliberate rather than
 * oversights. Reading is not mutation. The arrears sweep is already idempotent per loan per
 * business date and has no entity for a replay key to hang on, so it carries the trail
 * without the header; document submission and withdrawal are convergent — supplying the
 * same document twice, or withdrawing twice, leaves the same state — so they are audited
 * without being made to carry a header a customer's browser would have to mint.
 */

/** A handler, and the two questions asked of it. */
interface RouteExpectation {
  readonly name: string;
  readonly handler: (...args: never[]) => unknown;
  readonly idempotent: boolean;
  readonly action: string;
}

const ROUTES: readonly RouteExpectation[] = [
  {
    name: 'POST /loans/:id/repay',
    handler: LoansController.prototype.repay,
    idempotent: true,
    action: 'loan.repay',
  },
  {
    name: 'POST /loans/applications',
    handler: LoanApplicationsController.prototype.apply,
    idempotent: true,
    action: 'loan.application.create',
  },
  {
    name: 'POST /loans/applications/:id/accept',
    handler: LoanApplicationsController.prototype.accept,
    idempotent: true,
    action: 'loan.offer.accept',
  },
  {
    name: 'POST /loans/applications/:id/documents',
    handler: LoanApplicationsController.prototype.documents,
    idempotent: false,
    action: 'loan.application.documents',
  },
  {
    name: 'POST /loans/applications/:id/withdraw',
    handler: LoanApplicationsController.prototype.withdraw,
    idempotent: false,
    action: 'loan.application.withdraw',
  },
  {
    name: 'POST /admin/loans/applications/:id/decide',
    handler: AdminLoansController.prototype.decide,
    idempotent: true,
    action: 'loan.application.decide',
  },
  {
    name: 'POST /admin/arrears/:id/payment-plan',
    handler: AdminArrearsController.prototype.paymentPlan,
    idempotent: true,
    action: 'loan.paymentPlan.agree',
  },
  {
    name: 'POST /admin/arrears/:id/restructure',
    handler: AdminArrearsController.prototype.restructure,
    idempotent: true,
    action: 'loan.restructure',
  },
  {
    name: 'POST /admin/arrears/:id/write-off',
    handler: AdminArrearsController.prototype.writeOff,
    idempotent: true,
    action: 'loan.writeOff',
  },
  {
    name: 'POST /admin/arrears/sweep',
    handler: AdminArrearsController.prototype.sweep,
    idempotent: false,
    action: 'loan.arrears.sweep',
  },
];

/** Routes that only read. Marking one of these would demand a header for nothing. */
const READ_ONLY: readonly ((...args: never[]) => unknown)[] = [
  LoansController.prototype.list,
  LoansController.prototype.get,
  LoansController.prototype.schedule,
  LoansController.prototype.payoffQuote,
  LoanApplicationsController.prototype.list,
  LoanApplicationsController.prototype.get,
  AdminLoansController.prototype.queue,
  AdminArrearsController.prototype.queue,
];

describe('lending routes that change something', () => {
  it.each(ROUTES)('$name is audited under a stable action name', (route) => {
    const audited = Reflect.getMetadata(AUDITED_METADATA, route.handler) as
      | AuditedOptions
      | undefined;

    expect(audited?.action).toBe(route.action);
    expect(audited?.entity).toBeTruthy();
  });

  it.each(ROUTES.filter((route) => route.idempotent))(
    '$name refuses to run twice on a replayed request',
    (route) => {
      expect(Reflect.getMetadata(IDEMPOTENT_METADATA, route.handler)).toBe(true);
    },
  );
});

describe('lending routes that only read', () => {
  it('neither audits nor demands an idempotency key', () => {
    for (const handler of READ_ONLY) {
      expect(Reflect.getMetadata(AUDITED_METADATA, handler)).toBeUndefined();
      expect(Reflect.getMetadata(IDEMPOTENT_METADATA, handler)).toBeUndefined();
    }
  });
});
