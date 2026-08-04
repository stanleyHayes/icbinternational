/**
 * An honest, in-memory `DepositStore`.
 *
 * {@link listMaturing} returns only `ACTIVE` deposits, so a test can prove that a deposit
 * broken before its maturity date is not later picked up by the maturity run and paid out
 * a second time. A fake that filtered on the date alone would let that test pass while the
 * production path paid twice.
 */

import { Injectable } from '@nestjs/common';

import { IdGenerator } from '../../common/ids/id-generator.js';

import {
  DepositStore,
  type DepositPatchFields,
  type DepositQuery,
  type DepositRecord,
  type MaturityQuery,
  type NewDeposit,
} from './deposit.store.js';
import { DepositStatus } from './deposit.types.js';

@Injectable()
export class InMemoryDepositStore extends DepositStore {
  private readonly byId = new Map<string, DepositRecord>();

  constructor(private readonly ids: IdGenerator) {
    super();
  }

  override async insert(deposit: NewDeposit): Promise<DepositRecord> {
    const record: DepositRecord = { ...deposit, id: this.ids.generate('deposit') };
    this.byId.set(record.id, record);
    return record;
  }

  override async findById(id: string): Promise<DepositRecord | null> {
    return this.byId.get(id) ?? null;
  }

  override async list(query: DepositQuery): Promise<DepositRecord[]> {
    return [...this.byId.values()]
      .filter((deposit) => (query.userId ? deposit.userId === query.userId : true))
      .filter((deposit) => (query.status ? deposit.status === query.status : true))
      .sort((left, right) => right.placedAt.getTime() - left.placedAt.getTime());
  }

  override async patch(id: string, fields: DepositPatchFields): Promise<DepositRecord | null> {
    const current = this.byId.get(id);
    if (!current) return null;

    const updated: DepositRecord = { ...current, ...definedOnly(fields) };
    this.byId.set(id, updated);
    return updated;
  }

  override async listMaturing(query: MaturityQuery): Promise<DepositRecord[]> {
    return [...this.byId.values()]
      .filter((deposit) => deposit.status === DepositStatus.ACTIVE)
      .filter((deposit) => deposit.maturesOn <= query.asOf)
      .sort((left, right) => (left.maturesOn < right.maturesOn ? -1 : 1))
      .slice(0, query.limit);
  }

  /** Every stored deposit, for assertions. */
  all(): DepositRecord[] {
    return [...this.byId.values()];
  }

  /**
   * Captures the whole store so an aborted transaction can be undone.
   *
   * This store has no sessions and cannot roll anything back on its own, which would make
   * it useless for the property that actually matters here: that a deposit record and the
   * posting that funds it either both land or neither does. A test runner that snapshots
   * before an attempt and restores after a failure reproduces exactly what MongoDB does
   * on abort — without it, "written in one transaction" and "written, then the posting
   * failed" look identical, and that is the defect these tests exist to catch.
   */
  snapshot(): readonly DepositRecord[] {
    return [...this.byId.values()];
  }

  /** Puts the store back to a {@link snapshot}, discarding everything written since. */
  restore(records: readonly DepositRecord[]): void {
    this.byId.clear();
    for (const record of records) this.byId.set(record.id, record);
  }
}

/** Drops keys the caller left out, so a patch never clears a field by omission. */
function definedOnly(fields: DepositPatchFields): Partial<DepositRecord> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as Partial<DepositRecord>;
}
