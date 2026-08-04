import { Injectable } from '@nestjs/common';

import { HoldStatus } from '@reliance/contracts';

import { IdGenerator } from '../../common/ids/id-generator.js';

import {
  HoldStore,
  type ExpiredHoldQuery,
  type HoldRecord,
  type NewHold,
  type ResolveHoldInput,
} from './hold.store.js';

/**
 * An honest, in-memory `HoldStore`.
 *
 * The rule that matters is reproduced exactly: {@link resolve} refuses a hold that is not
 * `ACTIVE` and returns null, so a test can prove that a second capture is rejected rather
 * than quietly giving the reserve back twice. A fake that resolved unconditionally would
 * make the exactly-once tests pass while the production path could still double-release.
 *
 * Shipped in `src` because the cards lane needs a hold sink before a replica set exists,
 * and because a fake living beside its abstraction cannot drift away from it unnoticed.
 */
@Injectable()
export class InMemoryHoldStore extends HoldStore {
  private readonly byId = new Map<string, HoldRecord>();

  constructor(private readonly ids: IdGenerator) {
    super();
  }

  override async insert(hold: NewHold): Promise<HoldRecord> {
    const record: HoldRecord = {
      ...hold,
      id: this.ids.generate('hold'),
      status: HoldStatus.ACTIVE,
      resolvedAt: null,
      capturedAmount: null,
      capturedEntryId: null,
    };
    this.byId.set(record.id, record);
    return record;
  }

  override async findById(id: string): Promise<HoldRecord | null> {
    return this.byId.get(id) ?? null;
  }

  override async listActive(accountId: string): Promise<HoldRecord[]> {
    return this.live()
      .filter((hold) => hold.accountId === accountId)
      .sort((left, right) => right.placedAt.getTime() - left.placedAt.getTime());
  }

  override async resolve(input: ResolveHoldInput): Promise<HoldRecord | null> {
    const current = this.byId.get(input.holdId);
    if (!current || current.status !== HoldStatus.ACTIVE) return null;

    const resolved: HoldRecord = {
      ...current,
      status: input.status,
      resolvedAt: input.resolvedAt,
      capturedAmount: input.capturedAmount ?? current.capturedAmount,
      capturedEntryId: input.capturedEntryId ?? current.capturedEntryId,
    };
    this.byId.set(resolved.id, resolved);
    return resolved;
  }

  override async listExpired(query: ExpiredHoldQuery): Promise<HoldRecord[]> {
    return this.live()
      .filter((hold) => hold.expiresAt !== null && hold.expiresAt.getTime() <= query.asOf.getTime())
      .sort((left, right) => expiryOf(left) - expiryOf(right))
      .slice(0, query.limit);
  }

  /** Every stored hold, for assertions. */
  all(): HoldRecord[] {
    return [...this.byId.values()];
  }

  /** Empties the store. Cheaper than rebuilding the module between tests. */
  reset(): void {
    this.byId.clear();
  }

  private live(): HoldRecord[] {
    return [...this.byId.values()].filter((hold) => hold.status === HoldStatus.ACTIVE);
  }
}

/** Only reachable for holds already filtered to a non-null expiry. */
function expiryOf(hold: HoldRecord): number {
  return hold.expiresAt ? hold.expiresAt.getTime() : 0;
}
