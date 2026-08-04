import { Controller, Get } from '@nestjs/common';

import { ErrorCode, Permission, routes } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import { AdminEndpoint } from '../rbac/index.js';

/**
 * Three read-only admin surfaces the contract declares and no domain owns yet.
 *
 * This file previously described itself as wired "so the route coverage check passes",
 * which is the gate being answered rather than met, and all three returned `[]`. Two of
 * them can honestly return an empty collection. The third could not, and the difference is
 * the point:
 *
 *   - **Fraud rules** and **comms campaigns** are collections of things an operator creates.
 *     Nothing in the system creates either yet, so empty is not a placeholder — it is the
 *     true count. The console renders "none configured" and is not misled.
 *
 *   - **Screening hits** is a compliance answer about a named person. An empty list there
 *     does not read as "nothing configured", it reads as "this customer is clear" — and
 *     nothing has screened them. That is a false assurance an operator would act on, so it
 *     fails closed instead.
 *
 * The rule this leaves behind: a placeholder may return an empty collection only where
 * empty is indistinguishable from the truth. Where absence of data would be read as a
 * finding, it must fail.
 */

/** KYC sanctions and PEP screening hits. */
@Controller()
export class AdminScreeningController {
  /** `GET /admin/screening` — refuses until something actually screens. */
  @Get(routes.admin.screeningHits)
  @AdminEndpoint(Permission.KYC_READ)
  list(): never {
    throw new AppError({
      code: ErrorCode.FEATURE_DISABLED,
      message:
        'Sanctions screening results are not available here yet. Check the provider console ' +
        'before clearing a customer.',
    });
  }
}

/** Fraud rule management. */
@Controller()
export class AdminFraudRulesController {
  /**
   * `GET /admin/fraud/rules` — the configured rules, of which there are none.
   *
   * Empty is the true answer: no rule can exist until there is a path that writes one, and
   * the contract declares no such route.
   */
  @Get(routes.admin.fraudRules)
  @AdminEndpoint(Permission.FRAUD_MANAGE)
  list(): { data: never[] } {
    return { data: [] };
  }
}

/** Comms campaign management. */
@Controller()
export class AdminCommsController {
  /**
   * `GET /admin/comms/campaigns` — the configured campaigns, of which there are none.
   *
   * Empty is the true answer, for the same reason as the fraud rules above.
   */
  @Get(routes.admin.campaigns)
  @AdminEndpoint(Permission.COMMS_SEND)
  list(): { data: never[] } {
    return { data: [] };
  }
}
