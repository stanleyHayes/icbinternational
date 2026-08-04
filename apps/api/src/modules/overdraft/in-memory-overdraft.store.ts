/**
 * An honest, in-memory `OverdraftStore`.
 *
 * {@link listForAccrual} returns only facilities that are live and have not already been
 * charged on the business date, so a test can prove that running the daily interest job
 * twice charges one day of interest. A fake that ignored `lastAccruedOn` would let that
 * test pass while the production path double-charged every customer who was overdrawn.
 */

import { Injectable } from '@nestjs/common';

import { IdGenerator } from '../../common/ids/id-generator.js';

import {
  OverdraftStatus,
  OverdraftStore,
  type AccrualQuery,
  type InsertOverdraftResult,
  type NewOverdraft,
  type OverdraftPatchFields,
  type OverdraftRecord,
} from './overdraft.store.js';

/** Statuses on which interest can still accrue: a suspended facility still owes. */
const ACCRUING: ReadonlySet<OverdraftStatus> = new Set([
  OverdraftStatus.ACTIVE,
  OverdraftStatus.SUSPENDED,
]);

@Injectable()
export class InMemoryOverdraftStore extends OverdraftStore {
  private readonly byId = new Map<string, OverdraftRecord>();

  constructor(private readonly ids: IdGenerator) {
    super();
  }

  /**
   * Writes the facility, refusing a second `ACTIVE` one exactly as the partial index would.
   *
   * The scan and the write share one synchronous block with no `await` between them, so
   * two callers racing through `request()` cannot both find the account free. That is the
   * in-memory equivalent of the unique partial index in `overdraft.schema.ts`, and a fake
   * that inserted unconditionally would let the concurrency test pass against behaviour
   * the real store can never produce.
   */
  override async insertIfNoActiveFacility(facility: NewOverdraft): Promise<InsertOverdraftResult> {
    const live = this.activeOn(facility.accountId);
    if (live) return { conflictWith: live };

    const record: OverdraftRecord = { ...facility, id: this.ids.generate('loan') };
    this.byId.set(record.id, record);
    return { facility: record };
  }

  override async findById(id: string): Promise<OverdraftRecord | null> {
    return this.byId.get(id) ?? null;
  }

  override async findActiveByAccount(accountId: string): Promise<OverdraftRecord | null> {
    return this.activeOn(accountId);
  }

  override async findByAccount(accountId: string): Promise<OverdraftRecord | null> {
    return (
      [...this.byId.values()]
        .filter((facility) => facility.accountId === accountId)
        .sort((left, right) => right.requestedAt.getTime() - left.requestedAt.getTime())
        .at(0) ?? null
    );
  }

  override async listByUser(userId: string): Promise<OverdraftRecord[]> {
    return [...this.byId.values()]
      .filter((facility) => facility.userId === userId)
      .sort((left, right) => right.requestedAt.getTime() - left.requestedAt.getTime());
  }

  override async patch(id: string, fields: OverdraftPatchFields): Promise<OverdraftRecord | null> {
    const current = this.byId.get(id);
    if (!current) return null;

    const updated: OverdraftRecord = { ...current, ...definedOnly(fields) };
    this.byId.set(id, updated);
    return updated;
  }

  override async listForAccrual(query: AccrualQuery): Promise<OverdraftRecord[]> {
    return [...this.byId.values()]
      .filter((facility) => ACCRUING.has(facility.status))
      .filter((facility) => facility.lastAccruedOn !== query.asOf)
      .sort((left, right) => left.requestedAt.getTime() - right.requestedAt.getTime())
      .slice(0, query.limit);
  }

  /** Every stored facility, for assertions. */
  all(): OverdraftRecord[] {
    return [...this.byId.values()];
  }

  /** Synchronous on purpose — see {@link insertIfNoActiveFacility}. */
  private activeOn(accountId: string): OverdraftRecord | null {
    return (
      [...this.byId.values()].find(
        (facility) =>
          facility.accountId === accountId && facility.status === OverdraftStatus.ACTIVE,
      ) ?? null
    );
  }
}

/** Drops keys the caller left out, so a patch never clears a field by omission. */
function definedOnly(fields: OverdraftPatchFields): Partial<OverdraftRecord> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as Partial<OverdraftRecord>;
}
