import { Injectable } from '@nestjs/common';

import { type FeatureFlag } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';

/**
 * In-memory feature flag store.
 *
 * Seeded with the flags the client apps already reference. A flag not in this store is
 * treated as disabled everywhere — the safe default for an unknown flag.
 *
 * Process-local (dev/demo). Production would use Redis or a purpose-built LaunchDarkly
 * integration with a database-backed fallback.
 */
@Injectable()
export class FeatureFlagStore {
  private readonly flags: Map<string, FeatureFlag>;
  constructor(clock: ClockService) {
    const now = clock.now().toISOString();
    this.flags = new Map(seedFlags(now).map((flag) => [flag.key, flag]));
  }

  list(): FeatureFlag[] {
    return [...this.flags.values()].sort((a, b) => a.key.localeCompare(b.key));
  }

  findByKey(key: string): FeatureFlag | undefined {
    return this.flags.get(key);
  }

  upsert(flag: FeatureFlag): FeatureFlag {
    this.flags.set(flag.key, flag);
    return flag;
  }

  isEnabled(key: string): boolean {
    return this.flags.get(key)?.enabled ?? false;
  }
}

function seedFlags(now: string): FeatureFlag[] {
  return [
  {
    key: 'bulk-transfers-v2',
    description: 'Enables the v2 bulk transfer CSV engine.',
    enabled: false,
    rolloutBps: 0,
    segments: [],
    updatedAt: now,
  },
  {
    key: 'fx-live-rates',
    // Flag descriptions render in the console's flag table, so this is product copy and
    // §4.6 applies: it names the two rate sources, not the state of the build.
    description: 'Prices FX quotes from the live market feed rather than indicative reference rates.',
    enabled: false,
    rolloutBps: 0,
    segments: [],
    updatedAt: now,
  },
  {
    key: 'open-banking-pis',
    description: 'Enables the open-banking payment initiation surface.',
    enabled: false,
    rolloutBps: 0,
    segments: [],
    updatedAt: now,
  },
  {
    key: 'savings-goals-v2',
    description: 'New savings goal UX with round-up contributions.',
    enabled: false,
    rolloutBps: 0,
    segments: [],
    updatedAt: now,
  },
  ];
}
