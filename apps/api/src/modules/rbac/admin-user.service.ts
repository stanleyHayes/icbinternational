import { Injectable } from '@nestjs/common';

import { AdminRole, Permission, type AdminUser } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { IdGenerator } from '../../common/ids/id-generator.js';

import { type AdminPrincipal } from './admin-auth.types.js';
import { toAdminUserDto } from './admin-user.mapper.js';
import { AdminUserRepository, type CreateAdminUserInput } from './admin-user.repository.js';
import { MAX_ALLOWLIST_ENTRIES } from './rbac.constants.js';
import { effectivePermissions } from './role-catalog.js';
import { type AdminUserDoc } from './schemas/admin-user.schema.js';

/** Input for provisioning a staff account. */
export interface ProvisionAdminInput {
  email: string;
  fullName: string;
  roles: readonly AdminRole[];
  grants?: readonly Permission[];
  ipAllowlist?: readonly string[];
}

/**
 * Staff-account reads and the resolution the guard chain is built on.
 *
 * The one method that matters is {@link principalFor}: it turns a stored row into the
 * effective permission set a request is authorised with. Resolution happens on every
 * request, never at login — a deactivated admin or a re-bundled role takes effect at the
 * next call, not after the token expires.
 */
@Injectable()
export class AdminUserService {
  constructor(
    private readonly admins: AdminUserRepository,
    private readonly ids: IdGenerator,
    private readonly clock: ClockService,
  ) {}

  /**
   * Resolves an admin id to its principal, or null when no such admin exists.
   *
   * The caller (the auth guard) decides what null means; this service only reports.
   * Grants are narrowed against the contract `Permission` values, so a stale or
   * misspelled grant in the database is dropped rather than honoured — fail closed.
   */
  async principalFor(id: string): Promise<AdminPrincipal | null> {
    const doc = await this.admins.findByPublicId(id);
    return doc ? toPrincipal(doc) : null;
  }

  /** The contract DTO for one admin, or null — the console's staff-detail shape. */
  async describe(id: string): Promise<AdminUser | null> {
    const doc = await this.admins.findByPublicId(id);
    return doc ? toAdminUserDto(doc, toPrincipal(doc)) : null;
  }

  /** Provisions a staff account and returns its principal. */
  async provision(input: ProvisionAdminInput): Promise<AdminPrincipal> {
    const allowlist = [...(input.ipAllowlist ?? [])];
    if (allowlist.length > MAX_ALLOWLIST_ENTRIES) {
      throw AppError.validation('The IP allowlist is too long', [
        { path: 'ipAllowlist', message: `At most ${MAX_ALLOWLIST_ENTRIES} entries` },
      ]);
    }

    const create: CreateAdminUserInput = {
      id: this.ids.generate('adminUser'),
      // Normalised here, at the domain boundary, rather than only in the repository.
      // Two rows differing by case are two accounts the login lookup can never both find,
      // and a seed or an import that bypasses the repository would create exactly that.
      email: input.email.trim().toLowerCase(),
      fullName: input.fullName,
      roles: [...input.roles],
      grants: [...(input.grants ?? [])],
      ipAllowlist: allowlist,
    };
    const doc = await this.admins.createAdmin(create);
    return toPrincipal(doc);
  }

  /** Records a successful login on the simulated clock. */
  async recordLogin(id: string): Promise<void> {
    await this.admins.recordLogin(id, this.clock.now());
  }

  /** Deactivates a staff account. Takes effect on the very next request. */
  async deactivate(id: string): Promise<void> {
    await this.admins.deactivate(id);
  }
}

/** The role strings that exist in the contract, for narrowing stored roles. */
const KNOWN_ROLES: ReadonlySet<string> = new Set<string>(Object.values(AdminRole));

/** Document → principal, with every stored string narrowed against the contract. */
function toPrincipal(doc: AdminUserDoc): AdminPrincipal {
  const roles = doc.roles.filter((role): role is AdminRole => KNOWN_ROLES.has(role));

  return {
    id: doc.id,
    email: doc.email,
    fullName: doc.fullName,
    roles,
    permissions: effectivePermissions(roles, doc.grants),
    active: doc.active,
    ipAllowlist: [...doc.ipAllowlist],
  };
}
