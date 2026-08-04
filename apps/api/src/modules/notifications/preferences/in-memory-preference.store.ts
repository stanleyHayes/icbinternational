import { Injectable } from '@nestjs/common';

import { ClockService } from '../../../common/clock/clock.service.js';

import {
  PreferenceStore,
  type PreferenceRecord,
  type SavePreferenceInput,
} from './preference.store.js';

/**
 * In-process preference matrix.
 *
 * Stores exactly what it is given, including a `SECURITY` row switched off — which is the
 * point. The mandatory-delivery test needs a store that will happily persist the muted
 * preference, so that what it proves is the resolver's override rather than the store's
 * refusal to record it.
 */
@Injectable()
export class InMemoryPreferenceStore extends PreferenceStore {
  private readonly byUser = new Map<string, PreferenceRecord>();

  constructor(private readonly clock: ClockService = new ClockService()) {
    super();
  }

  override async findFor(userId: string): Promise<PreferenceRecord | null> {
    return this.byUser.get(userId) ?? null;
  }

  override async save(input: SavePreferenceInput): Promise<PreferenceRecord> {
    const record: PreferenceRecord = { ...input, updatedAt: this.clock.now() };
    this.byUser.set(input.userId, record);
    return record;
  }
}
