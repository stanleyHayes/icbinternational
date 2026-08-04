import { Injectable } from '@nestjs/common';

import { IdGenerator } from '../../common/ids/id-generator.js';

import {
  BeneficiaryStore,
  type BeneficiaryPatchInput,
  type BeneficiaryQuery,
  type BeneficiaryRecord,
  type NewBeneficiary,
  type TouchBeneficiaryInput,
} from './beneficiary.store.js';

/**
 * An honest, in-memory {@link BeneficiaryStore}.
 *
 * "Honest" is the load-bearing word: it enforces the same `{userId, matchKeys}` uniqueness
 * the Mongo unique index does, scopes every read to the owner the way the repository's
 * filters do, and returns the incumbent on a duplicate insert rather than replacing it.
 * A test that passes here is testing the cooling-off rule, not the fake's leniency.
 *
 * Shipped in `src`, as the ledger and accounts lanes ship theirs, because the seed and
 * simulation workstreams need a payee sink before a replica set is available — and a fake
 * that lives beside its abstraction cannot quietly drift from it.
 */
@Injectable()
export class InMemoryBeneficiaryStore extends BeneficiaryStore {
  private readonly byId = new Map<string, BeneficiaryRecord>();

  constructor(private readonly ids: IdGenerator = new IdGenerator()) {
    super();
  }

  override async insert(beneficiary: NewBeneficiary): Promise<BeneficiaryRecord> {
    const existing = await this.findByKeys(beneficiary.userId, beneficiary.matchKeys);
    if (existing) return existing;

    const record: BeneficiaryRecord = {
      ...beneficiary,
      id: this.ids.generate('beneficiary'),
      matchKeys: [...beneficiary.matchKeys],
      lastUsedAt: null,
    };

    this.byId.set(record.id, record);
    return record;
  }

  override async findById(id: string, userId: string): Promise<BeneficiaryRecord | null> {
    const record = this.byId.get(id);
    return record && record.userId === userId ? record : null;
  }

  override async listByUser(query: BeneficiaryQuery): Promise<BeneficiaryRecord[]> {
    return [...this.byId.values()]
      .filter((record) => record.userId === query.userId)
      .filter((record) => !query.favouritesOnly || record.isFavourite)
      .sort(byFavouriteThenRecency);
  }

  override async findByKeys(
    userId: string,
    keys: readonly string[],
  ): Promise<BeneficiaryRecord | null> {
    if (keys.length === 0) return null;

    return (
      [...this.byId.values()].find(
        (record) => record.userId === userId && record.matchKeys.some((key) => keys.includes(key)),
      ) ?? null
    );
  }

  override async count(userId: string): Promise<number> {
    return [...this.byId.values()].filter((record) => record.userId === userId).length;
  }

  /** Read and write with no `await` between them, as `findOneAndUpdate` does. */
  override async patch(input: BeneficiaryPatchInput): Promise<BeneficiaryRecord | null> {
    const held = this.byId.get(input.id);
    const record = held && held.userId === input.userId ? held : null;
    if (!record) return null;

    const updated: BeneficiaryRecord = { ...record, ...definedOnly(input.fields) };
    this.byId.set(updated.id, updated);
    return updated;
  }

  override async touch(input: TouchBeneficiaryInput): Promise<void> {
    const record = this.byId.get(input.id);
    if (!record) return;
    this.byId.set(record.id, { ...record, lastUsedAt: input.usedAt });
  }

  override async remove(id: string, userId: string): Promise<boolean> {
    const held = this.byId.get(id);
    if (!held || held.userId !== userId) return false;
    return this.byId.delete(id);
  }
}

/** Mirrors the repository's sort: favourites, then most recently used, then newest. */
function byFavouriteThenRecency(left: BeneficiaryRecord, right: BeneficiaryRecord): number {
  if (left.isFavourite !== right.isFavourite) return left.isFavourite ? -1 : 1;

  const used = timeOf(right.lastUsedAt) - timeOf(left.lastUsedAt);
  return used === 0 ? right.createdAt.getTime() - left.createdAt.getTime() : used;
}

function timeOf(instant: Date | null): number {
  return instant ? instant.getTime() : 0;
}

/** Drops absent fields so an unset patch key does not overwrite a value with `undefined`. */
function definedOnly<T extends object>(fields: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
