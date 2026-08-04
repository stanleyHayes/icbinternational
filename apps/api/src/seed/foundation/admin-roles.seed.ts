import { Injectable } from '@nestjs/common';

import { AdminRole } from '@reliance/contracts';

import { roleIdFor } from '../../modules/rbac/rbac.constants.js';
import { SeedWriter, type SeedDocument } from '../seed-writer.js';
import { ROLES_COLLECTION } from '../seed.constants.js';
import { type SeedOutcome, type Seeder } from '../seed.types.js';

import { ROLE_DEFINITIONS } from './roles/role-definitions.js';

/**
 * Seeds the ten staff roles and the permissions each carries.
 *
 * Roles are seeded rather than hard-coded in a guard because an operations team changes
 * shape and a permission bundle is configuration, not code. What is *not* configuration
 * is the permission vocabulary itself: guards compare against the strings in the contract,
 * so a role granting a permission that does not exist is caught here at seed time rather
 * than discovered as a silently-denied request.
 */
@Injectable()
export class AdminRolesSeeder implements Seeder {
  readonly name = 'admin-roles';

  constructor(private readonly writer: SeedWriter) {}

  async run(): Promise<SeedOutcome> {
    const documents: SeedDocument[] = ROLE_DEFINITIONS.map((definition) => ({
      // The collection carries a unique index on `id`, so the seed must mint one.
      // Omitting it made every role after the first collide on `id: null` — a duplicate
      // key error that reads like a data clash but is really a missing field.
      id: roleIdFor(definition.role),
      role: definition.role,
      name: definition.name,
      description: definition.description,
      permissions: [...definition.permissions],
      /** Built-in roles cannot be deleted by an administrator; only their members change. */
      builtIn: true,
    }));

    assertEveryRoleDefined(documents);

    return this.writer.sync({
      collection: ROLES_COLLECTION,
      keyFields: ['role'],
      documents,
    });
  }
}

/**
 * Refuses to seed a partial RBAC table.
 *
 * A missing role is worse than a broken one: the guard finds no permissions, denies
 * everything, and the failure looks like an authorisation bug rather than missing data.
 */
function assertEveryRoleDefined(documents: readonly SeedDocument[]): void {
  const defined = new Set(documents.map((document) => document['role']));
  const missing = Object.values(AdminRole).filter((role) => !defined.has(role));

  if (missing.length > 0) {
    throw new RangeError(`The role seed is missing: ${missing.join(', ')}`);
  }
}
