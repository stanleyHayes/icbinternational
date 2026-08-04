import { Injectable } from '@nestjs/common';

import { AdminRole, Permission, type AdminUser } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { IdGenerator } from '../../common/ids/id-generator.js';
import { PasswordService } from '../auth/password.service.js';
import { SecretCipher } from '../auth/support/secret-cipher.js';

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
  /**
   * Plaintext sign-in password. Hashed here; the caller's copy is the only one that ever
   * exists in the clear. Optional, because an account can be opened before its holder has
   * a credential — until they do, no password will authenticate them.
   */
  password?: string;
  /**
   * Plaintext base32 authenticator seed, sealed here. Supplying one completes enrolment;
   * without it the account has no second factor and therefore cannot sign in at all.
   */
  totpSecret?: string;
}

/** Result of an idempotent provision: the principal, and whether this call created it. */
export interface ProvisionOutcome {
  readonly principal: AdminPrincipal;
  readonly created: boolean;
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
    private readonly passwords: PasswordService,
    private readonly cipher: SecretCipher,
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
      ...(await this.credentialsFor(input)),
    };
    const doc = await this.admins.createAdmin(create);
    return toPrincipal(doc);
  }

  /**
   * Provisions a staff account unless one already holds the address.
   *
   * The seed lane needs this and could not write it itself. An Argon2 digest is salted, so
   * hashing the same password twice gives different bytes; a seeder that compared stored
   * to intended would rewrite the row on every run and never be idempotent. An account
   * that exists is returned untouched — its holder may have changed their password since.
   */
  async provisionIfAbsent(input: ProvisionAdminInput): Promise<ProvisionOutcome> {
    const existing = await this.admins.findByEmail(input.email.trim().toLowerCase());
    if (existing) return { principal: toPrincipal(existing), created: false };

    return { principal: await this.provision(input), created: true };
  }

  /**
   * Hashes the password and seals the authenticator seed.
   *
   * Both are omitted rather than written as null when absent, so a provision that supplies
   * neither leaves the schema defaults in place instead of asserting an empty credential.
   */
  private async credentialsFor(input: ProvisionAdminInput): Promise<Partial<CreateAdminUserInput>> {
    return {
      ...(input.password ? { passwordHash: await this.passwords.hash(input.password) } : {}),
      ...(input.totpSecret
        ? {
            mfa: {
              totpSecret: this.cipher.seal(input.totpSecret),
              enrolledAt: this.clock.now(),
            },
          }
        : {}),
    };
  }

  /** Records a successful login on the simulated clock. */
  async recordLogin(id: string): Promise<void> {
    await this.admins.recordLogin(id, this.clock.now());
  }

  /** Deactivates a staff account. Takes effect on the very next request. */
  async deactivate(id: string): Promise<void> {
    await this.admins.deactivate(id);
  }

  /** Paginated staff listing for the operations console. */
  async list(params: { cursor?: string; limit: number }): Promise<AdminUser[]> {
    const docs = await this.admins.listAll(params);
    return docs.map((doc) => toAdminUserDto(doc, toPrincipal(doc)));
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
