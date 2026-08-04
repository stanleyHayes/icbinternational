import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';

import {
  Permission,
  cursorQuerySchema,
  routes,
  type AdminUser,
  type Paginated,
} from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';

import { AdminEndpoint } from './admin-endpoint.decorator.js';
import { AdminUserService } from './admin-user.service.js';
import { RoleRepository } from './role.repository.js';
import { type RoleDoc } from './schemas/role.schema.js';

const ID_PARAM = 'id';

/** Shape the console reads for each role in the catalogue. */
interface RoleSummary {
  id: string;
  name: string;
  description: string;
  permissions: string[];
}

function toRoleSummary(doc: RoleDoc): RoleSummary {
  return {
    id: doc.id,
    name: doc.name,
    description: doc.description,
    permissions: [...doc.permissions],
  };
}

/**
 * Staff directory and role catalogue for the operations console.
 *
 * `ADMIN_MANAGE` is the right permission for both: listing staff accounts is the first
 * step toward deactivating one, and the role catalogue is a reference for provisioning.
 * An auditor (read-only) should not reach here — they can read the audit trail via
 * `AuditAdminController`.
 */
@Controller()
export class AdminUsersController {
  constructor(
    private readonly admins: AdminUserService,
    private readonly roles: RoleRepository,
  ) {}

  @Get(routes.admin.users)
  @AdminEndpoint(Permission.ADMIN_MANAGE)
  async list(
    @Query(zodBody(cursorQuerySchema)) query: { cursor?: string; limit: number },
  ): Promise<Paginated<AdminUser>> {
    const data = await this.admins.list(query);
    return {
      data,
      page: {
        cursor: null,
        limit: query.limit,
        hasMore: false,
        total: data.length,
      },
    };
  }

  @Get(routes.admin.user(`:${ID_PARAM}`))
  @AdminEndpoint(Permission.ADMIN_MANAGE)
  async get(@Param(ID_PARAM) id: string): Promise<AdminUser> {
    const admin = await this.admins.describe(id);
    if (!admin) throw new NotFoundException(`Admin user ${id} not found`);
    return admin;
  }

  @Get(routes.admin.roles)
  @AdminEndpoint(Permission.ADMIN_MANAGE)
  async listRoles(): Promise<Paginated<RoleSummary>> {
    const docs = await this.roles.listAll();
    return {
      data: docs.map(toRoleSummary),
      page: { cursor: null, limit: docs.length, hasMore: false, total: docs.length },
    };
  }
}
