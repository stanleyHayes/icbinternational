import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';

import { ErrorCode, Permission } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { Audited } from '../audit/index.js';
import { type AdminPrincipal } from '../rbac/admin-auth.types.js';
import { AdminEndpoint, CurrentAdmin } from '../rbac/index.js';

import { type LimitOverrideView } from './limit-override.mapper.js';
import { LimitOverrideService } from './limit-override.service.js';
import {
  ADMIN_OVERRIDE_ROUTE,
  ADMIN_OVERRIDES_ROUTE,
  AUDIT_ENTITY,
  OVERRIDE_ID_PARAM,
} from './limits.constants.js';
import { createLimitOverrideRequestSchema, type CreateLimitOverrideRequest } from './limits.dto.js';

/**
 * Limit override administration.
 *
 * Granting an override is the most direct way staff can let a customer move money the
 * catalogue and their KYC tier say they may not, so the whole surface sits behind
 * `product:write` and every grant and revocation is an audited event with the admin's
 * identity on it. There is no edit: a wrong grant is revoked and re-made, so the
 * history never contains a version of events that was silently corrected.
 */
@AdminEndpoint(Permission.PRODUCT_WRITE)
@Controller()
export class AdminLimitsController {
  constructor(private readonly overrides: LimitOverrideService) {}

  /** Grants a temporary override. The service refuses past or over-long expiries. */
  @Post(ADMIN_OVERRIDES_ROUTE)
  @Audited({ action: 'limit_override.grant', entity: AUDIT_ENTITY })
  grant(
    @CurrentAdmin() admin: AdminPrincipal | undefined,
    @Body(zodBody(createLimitOverrideRequestSchema)) request: CreateLimitOverrideRequest,
  ): Promise<LimitOverrideView> {
    return this.overrides.grant(request, actorFrom(admin));
  }

  /** Every override an account has ever had, newest first. */
  @Get(ADMIN_OVERRIDES_ROUTE)
  list(@Query('accountId') accountId: string | undefined): Promise<LimitOverrideView[]> {
    return this.overrides.listForAccount(requireAccountId(accountId));
  }

  /** Ends a grant early. The expiry would end it anyway; this ends it now. */
  @Delete(ADMIN_OVERRIDE_ROUTE)
  @Audited({ action: 'limit_override.revoke', entity: AUDIT_ENTITY, entityIdFrom: 'params.id' })
  revoke(@Param(OVERRIDE_ID_PARAM) id: string): Promise<LimitOverrideView> {
    return this.overrides.revoke(id);
  }
}

/** The guard chain guarantees a principal; an absent one is a wiring defect, not a 401. */
function actorFrom(admin: AdminPrincipal | undefined): { id: string } {
  if (!admin) {
    throw new AppError({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Limit override endpoint reached without an authenticated admin',
    });
  }
  return { id: admin.id };
}

/** Listing without an account would read as "every override the bank has ever granted". */
function requireAccountId(accountId: string | undefined): string {
  if (!accountId) {
    throw AppError.validation('An account id is required', [
      { path: 'accountId', message: 'The accountId query parameter is missing' },
    ]);
  }
  return accountId;
}
