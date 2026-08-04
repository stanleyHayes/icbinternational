import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { AppConfigModule } from '../../config/config.module.js';
import { PasswordService } from '../auth/password.service.js';
import { SecretCipher } from '../auth/support/secret-cipher.js';
import { TotpService } from '../mfa/totp.service.js';

import { AdminAuthController } from './admin-auth.controller.js';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { AdminCookiesService } from './admin-cookies.service.js';
import { AdminLoginService } from './admin-login.service.js';
import { AdminTokenService } from './admin-token.service.js';
import { AdminUserRepository } from './admin-user.repository.js';
import { AdminUserService } from './admin-user.service.js';
import { AdminUsersController } from './admin-users.controller.js';
import { IpAllowlistGuard } from './ip-allowlist.guard.js';
import { PermissionGuard } from './permission.guard.js';
import { RoleSyncService } from './role-sync.service.js';
import { RoleRepository } from './role.repository.js';
import { AdminUserDocument, AdminUserSchema } from './schemas/admin-user.schema.js';
import { RoleDocument, RoleSchema } from './schemas/role.schema.js';

/**
 * Staff RBAC: the `admin_users` and `roles` collections, the role→permission catalogue,
 * the sign-in endpoints, and the three-guard admin chain (`AdminAuthGuard` →
 * `IpAllowlistGuard` → `PermissionGuard`) behind the `@AdminEndpoint()` composite.
 *
 * The exports are the module's real surface. The guards and `@RequirePermission()` are
 * what every other admin controller consumes — including the two already written against
 * this shape ahead of it (`modules/gl`'s chart endpoints read the same
 * `request.adminPermissions`; `modules/products`' admin controller takes a handoff).
 * `AdminUserService` is how the seed lane provisions operators; `RoleSyncService` mirrors
 * the catalogue for the console to list.
 *
 * The module resolves standalone, and that is worth keeping: fifteen feature modules
 * import it, so anything it drags in, they all drag in. `JwtService` and `IdGenerator` are
 * provided here the way `AuthModule` provides its own, and the three credential services —
 * the Argon2 hasher, the secret cipher and the TOTP verifier — are provided rather than
 * imported for the same reason. They are the same classes the customer surface uses, not
 * second implementations; importing `AuthModule` to reach them would pull the whole
 * customer identity graph (users, devices, sessions, the email port) into every admin
 * controller's dependency tree. `MfaModule` keeps `AuthCookiesService` locally on exactly
 * this reasoning. The cost is one extra decoy hash at boot.
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
  controllers: [AdminAuthController, AdminUsersController],
  providers: [
    { provide: JwtService, useFactory: () => new JwtService() },
    IdGenerator,
    PasswordService,
    SecretCipher,
    TotpService,
    AdminUserRepository,
    RoleRepository,
    AdminUserService,
    AdminLoginService,
    AdminCookiesService,
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
