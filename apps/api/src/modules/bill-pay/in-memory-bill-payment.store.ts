import { Injectable } from '@nestjs/common';

import { BillPaymentStatus } from '@reliance/contracts';

import { IdGenerator } from '../../common/ids/id-generator.js';

import {
  BillPaymentStore,
  type BillPaymentListQuery,
  type BillPaymentRecord,
  type BillPaymentTransition,
  type NewBillPayment,
  type StrandedQuery,
} from './bill-payment.store.js';

/**
 * An honest, in-memory {@link BillPaymentStore}.
 *
 * {@link transition} reads and writes with no `await` between them and applies the same
 * status precondition the repository puts in its filter. That is what makes the
 * auto-reversal test meaningful: the job must be unable to refund a payment twice, and a
 * fake that allowed it would let a double-credit ship while the test stayed green.
 */
@Injectable()
export class InMemoryBillPaymentStore extends BillPaymentStore {
  private readonly byId = new Map<string, BillPaymentRecord>();

  constructor(private readonly ids: IdGenerator = new IdGenerator()) {
    super();
  }

  override async insert(payment: NewBillPayment): Promise<BillPaymentRecord> {
    const record: BillPaymentRecord = {
      ...payment,
      id: this.ids.generate('transferOrder'),
      billerReceipt: null,
      rejection: null,
      failureReason: null,
      settlementEntryId: null,
      reversalEntryId: null,
      feeEntryId: null,
      attempts: 0,
      lastLatencyMs: null,
      submittedAt: null,
      completedAt: null,
    };

    this.byId.set(record.id, record);
    return record;
  }

  override async findById(id: string, userId: string): Promise<BillPaymentRecord | null> {
    const record = this.byId.get(id);
    return record && record.userId === userId ? record : null;
  }

  override async findByIdUnscoped(id: string): Promise<BillPaymentRecord | null> {
    return this.byId.get(id) ?? null;
  }

  override async list(query: BillPaymentListQuery): Promise<readonly BillPaymentRecord[]> {
    return [...this.byId.values()]
      .filter((record) => matches(record, query))
      .sort(newestFirst)
      .slice(0, query.limit);
  }

  override async transition(input: BillPaymentTransition): Promise<BillPaymentRecord | null> {
    const record = this.byId.get(input.id);
    if (!record || !input.fromStatuses.includes(record.status)) return null;

    const updated: BillPaymentRecord = {
      ...record,
      ...(input.patch ?? {}),
      status: input.status,
      attempts: record.attempts + (input.countAttempt ? 1 : 0),
    };

    this.byId.set(updated.id, updated);
    return updated;
  }

  override async dueForSubmission(at: Date, limit: number): Promise<readonly BillPaymentRecord[]> {
    return [...this.byId.values()]
      .filter(
        (record) =>
          record.status === BillPaymentStatus.PENDING &&
          record.scheduledFor.getTime() <= at.getTime(),
      )
      .sort((left, right) => left.scheduledFor.getTime() - right.scheduledFor.getTime())
      .slice(0, limit);
  }

  override async awaitingRefund(input: StrandedQuery): Promise<readonly BillPaymentRecord[]> {
    return [...this.byId.values()]
      .filter((record) => isStranded(record, input.before))
      .sort(oldestSubmissionFirst)
      .slice(0, input.limit);
  }
}

/** The same two shapes the repository's `$or` describes, applied to one record. */
function isStranded(record: BillPaymentRecord, before: Date): boolean {
  if (!record.submittedAt || record.submittedAt.getTime() > before.getTime()) return false;
  if (record.status === BillPaymentStatus.SUBMITTED) return true;

  return record.status === BillPaymentStatus.REJECTED && record.reversalEntryId === null;
}

function oldestSubmissionFirst(left: BillPaymentRecord, right: BillPaymentRecord): number {
  return (left.submittedAt?.getTime() ?? 0) - (right.submittedAt?.getTime() ?? 0);
}

function matches(record: BillPaymentRecord, query: BillPaymentListQuery): boolean {
  if (record.userId !== query.userId) return false;
  if (query.status && record.status !== query.status) return false;
  return !query.billerId || record.billerId === query.billerId;
}

function newestFirst(left: BillPaymentRecord, right: BillPaymentRecord): number {
  const byTime = right.createdAt.getTime() - left.createdAt.getTime();
  return byTime === 0 ? right.id.localeCompare(left.id) : byTime;
}
