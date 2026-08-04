import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { AppConfigModule } from '../../config/config.module.js';

import { AdminAuthGuard } from './admin-auth.guard.js';
import { AdminTokenService } from './admin-token.service.js';
import { AdminUserRepository } from './admin-user.repository.js';
import { AdminUserService } from './admin-user.service.js';
import { IpAllowlistGuard } from './ip-allowlist.guard.js';
import { PermissionGuard } from './permission.guard.js';
import { RoleSyncService } from './role-sync.service.js';
import { RoleRepository } from './role.repository.js';
import { AdminUserDocument, AdminUserSchema } from './schemas/admin-user.schema.js';
import { RoleDocument, RoleSchema } from './schemas/role.schema.js';

/**
 * Staff RBAC: the `admin_users` and `roles` collections, the role→permission catalogue,
 * and the three-guard admin chain (`AdminAuthGuard` → `IpAllowlistGuard` →
 * `PermissionGuard`) behind the `@AdminEndpoint()` composite.
 *
 * The exports are the module's real surface. The guards and `@RequirePermission()` are
 * what every other admin controller consumes — including the two already written against
 * this shape ahead of it (`modules/gl`'s chart endpoints read the same
 * `request.adminPermissions`; `modules/products`' admin controller takes a handoff).
 * `AdminTokenService` is how the admin login flow (A-05/K-01) issues tokens after SSO
 * and TOTP; `RoleSyncService` is for the seed lane (L-01).
 *
 * The module resolves standalone: `JwtService` and `IdGenerator` are provided here the
 * same way `AuthModule` provides its own, and config/clock arrive through their global
 * modules.
 */
@Module({
  imports: [
    // `AdminTokenService` reads the JWT secrets. `AppConfigModule` is global, but a test
    // that imports only this module never instantiates it — so declare it.
    AppConfigModule,
    MongooseModule.forFeature([
      { name: AdminUserDocument.name, schema: AdminUserSchema },
      { name: RoleDocument.name, schema: RoleSchema },
    ]),
  ],
  providers: [
    { provide: JwtService, useFactory: () => new JwtService() },
    IdGenerator,
    AdminUserRepository,
    RoleRepository,
    AdminUserService,
    RoleSyncService,
    AdminTokenService,
    AdminAuthGuard,
    IpAllowlistGuard,
    PermissionGuard,
  ],
  exports: [
    AdminUserService,
    RoleSyncService,
    AdminTokenService,
    AdminAuthGuard,
    IpAllowlistGuard,
    PermissionGuard,
  ],
})
export class RbacModule {}
