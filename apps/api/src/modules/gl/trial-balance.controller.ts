import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { Permission, routes, type TrialBalance } from '@reliance/contracts';
import { isCurrencyCode, type CurrencyCode } from '@reliance/money';

import { AdminPermissionGuard } from './admin-permission.guard.js';
import { RequireAdminPermission } from './require-admin-permission.decorator.js';
import { TrialBalanceService } from './trial-balance.service.js';

/**
 * The trial-balance report endpoint.
 *
 * Gross debits versus gross credits across the whole book, per currency — the report
 * that must sum to zero, and says so (`balanced`) when it does not.
 */
@Controller()
@UseGuards(AdminPermissionGuard)
export class TrialBalanceController {
  constructor(private readonly service: TrialBalanceService) {}

  /** `GET /admin/reports/trial-balance?currency=GBP` — defaults to the base currency. */
  @Get(routes.admin.trialBalance)
  @RequireAdminPermission(Permission.REPORT_READ)
  trialBalance(@Query('currency') currency?: string): Promise<TrialBalance> {
    return this.service.trialBalance(parseCurrency(currency));
  }
}

/** An unrecognised code means "use the default", matching how the FX board treats it. */
function parseCurrency(raw: string | undefined): CurrencyCode | undefined {
  if (raw === undefined) return undefined;
  const normalised = raw.trim().toUpperCase();
  return isCurrencyCode(normalised) ? normalised : undefined;
}
