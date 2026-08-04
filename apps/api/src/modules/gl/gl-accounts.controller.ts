import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';

import { Permission, type LedgerAccount } from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { AdminAuthGuard } from '../rbac/admin-auth.guard.js';

import { AdminPermissionGuard } from './admin-permission.guard.js';
import { GlAccountsService } from './gl-accounts.service.js';
import {
  createLedgerAccountBodySchema,
  renameLedgerAccountBodySchema,
  type CreateLedgerAccountBody,
  type RenameLedgerAccountBody,
} from './gl.dto.js';
import { RequireAdminPermission } from './require-admin-permission.decorator.js';

/**
 * Guarded admin CRUD for the chart of accounts.
 *
 * Every route requires an authenticated administrator holding `admin:manage`; the guard
 * fails closed until the RBAC module (A-06) populates the request. A contract proposal
 * for a dedicated `gl:manage` permission and for moving these routes into the route map
 * is recorded in the task handoff.
 */
@Controller('/admin/gl/accounts')
// `AdminAuthGuard` first: it is what puts `adminPermissions` on the request.
// Without it `AdminPermissionGuard` fails closed and every route here 401s, even
// for a SUPER_ADMIN holding the permission — which is exactly what happened.
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
export class GlAccountsController {
  constructor(private readonly service: GlAccountsService) {}

  /** The whole chart with base-currency balances. */
  @Get()
  @RequireAdminPermission(Permission.REPORT_READ)
  list(): Promise<LedgerAccount[]> {
    return this.service.listAccounts();
  }

  /** One account by GL code. */
  @Get(':code')
  @RequireAdminPermission(Permission.REPORT_READ)
  get(@Param('code') code: string): Promise<LedgerAccount> {
    return this.service.getAccount(code);
  }

  /** Adds a row to the chart. A duplicate code is a 409. */
  @Post()
  @RequireAdminPermission(Permission.ADMIN_MANAGE)
  create(
    @Body(zodBody(createLedgerAccountBodySchema)) body: CreateLedgerAccountBody,
  ): Promise<LedgerAccount> {
    return this.service.createAccount(body);
  }

  /** Renames a manually-created account. Seeded rows answer 412. */
  @Patch(':code')
  @RequireAdminPermission(Permission.ADMIN_MANAGE)
  rename(
    @Param('code') code: string,
    @Body(zodBody(renameLedgerAccountBodySchema)) body: RenameLedgerAccountBody,
  ): Promise<LedgerAccount> {
    return this.service.renameAccount(code, body.name);
  }

  /** Retires a manually-created, zero-balance account. */
  @Delete(':code')
  @RequireAdminPermission(Permission.ADMIN_MANAGE)
  deactivate(@Param('code') code: string): Promise<LedgerAccount> {
    return this.service.deactivateAccount(code);
  }
}
