import { Injectable } from '@nestjs/common';

import { AdminRole } from '@reliance/contracts';

import { roleIdFor } from './rbac.constants.js';
import { ROLE_PERMISSIONS } from './role-catalog.js';
import { RoleRepository } from './role.repository.js';

/** One line of the human description the console shows next to each role. */
const ROLE_DESCRIPTIONS: Readonly<Record<AdminRole, string>> = {
  [AdminRole.SUPER_ADMIN]: 'Full administrative access, including staff and flag management.',
  [AdminRole.COMPLIANCE_OFFICER]: 'KYC decisions, AML case handling and rule management.',
  [AdminRole.KYC_ANALYST]: 'Reviews onboarding cases and decides KYC outcomes.',
  [AdminRole.FRAUD_ANALYST]: 'Works fraud queues and manages transaction holds.',
  [AdminRole.OPERATIONS]: 'Day-to-day account operations, disputes, cards and batch jobs.',
  [AdminRole.TREASURY]: 'Initiates and approves manual postings to the general ledger.',
  [AdminRole.UNDERWRITER]: 'Reviews credit applications and decides loan outcomes.',
  [AdminRole.SUPPORT_AGENT]: 'Reads customer data and works support tickets.',
  [AdminRole.CONTENT_EDITOR]: 'Drafts and publishes marketing content.',
  [AdminRole.AUDITOR]: 'Read-only access to the audit trail and reports.',
};

/** Outcome of a catalogue sync, for the caller's log line. */
export interface RoleSyncResult {
  synced: number;
}

/**
 * Mirrors the code catalogue into the `roles` collection.
 *
 * Enforcement reads the code map; this collection exists so the console can list roles
 * without importing server code. The sync is upsert-only and keyed by name, so it is
 * safe to run at seed time and again at every deploy — a row can only ever restate what
 * the code already grants.
 */
@Injectable()
export class RoleSyncService {
  constructor(private readonly roles: RoleRepository) {}

  /** Upserts every catalogue role. Returns how many rows were written. */
  async syncCatalogue(): Promise<RoleSyncResult> {
    const entries = Object.entries(ROLE_PERMISSIONS) as [AdminRole, readonly string[]][];
    for (const [name, permissions] of entries) {
      await this.roles.upsertCatalogueRow({
        id: roleIdFor(name),
        name,
        description: ROLE_DESCRIPTIONS[name],
        permissions,
      });
    }
    return { synced: entries.length };
  }
}
