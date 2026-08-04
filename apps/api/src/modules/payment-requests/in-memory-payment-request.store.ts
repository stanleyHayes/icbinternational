import { Injectable } from '@nestjs/common';

import { PaymentRequestStatus } from '@reliance/contracts';

import { IdGenerator } from '../../common/ids/id-generator.js';

import {
  PaymentRequestStore,
  type NewPaymentRequest,
  type PaymentRequestRecord,
  type PaymentRequestTransition,
} from './payment-request.store.js';

/**
 * An honest, in-memory {@link PaymentRequestStore}.
 *
 * {@link transition} reads and writes with no `await` between them and enforces the same
 * status precondition the repository puts in its filter. That is what makes the
 * "an expired request cannot be paid" test worth having: the guarantee is a property of the
 * conditional write, and a fake that checked and then wrote would be testing the check
 * instead of the guarantee.
 */
@Injectable()
export class InMemoryPaymentRequestStore extends PaymentRequestStore {
  private readonly byId = new Map<string, PaymentRequestRecord>();

  constructor(private readonly ids: IdGenerator = new IdGenerator()) {
    super();
  }

  override async insert(request: NewPaymentRequest): Promise<PaymentRequestRecord> {
    const record: PaymentRequestRecord = {
      ...request,
      id: this.ids.generate('transferOrder'),
      status: PaymentRequestStatus.OPEN,
      paidByUserId: null,
      paidByName: null,
      paidFromAccountId: null,
      journalEntryId: null,
      nudgeCount: 0,
      lastNudgedAt: null,
      paidAt: null,
    };

    this.byId.set(record.id, record);
    return record;
  }

  override async findById(id: string): Promise<PaymentRequestRecord | null> {
    return this.byId.get(id) ?? null;
  }

  override async listByRequester(
    userId: string,
    limit: number,
  ): Promise<readonly PaymentRequestRecord[]> {
    return [...this.byId.values()]
      .filter((record) => record.userId === userId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, limit);
  }

  override async listBySplit(splitId: string): Promise<readonly PaymentRequestRecord[]> {
    return [...this.byId.values()]
      .filter((record) => record.splitId === splitId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }

  override async transition(input: PaymentRequestTransition): Promise<PaymentRequestRecord | null> {
    const record = this.byId.get(input.id);
    if (!record || !input.fromStatuses.includes(record.status)) return null;
    if (input.liveAt && record.expiresAt.getTime() <= input.liveAt.getTime()) return null;

    const updated: PaymentRequestRecord = {
      ...record,
      ...(input.patch ?? {}),
      status: input.status,
      ...(input.nudgedAt
        ? { lastNudgedAt: input.nudgedAt, nudgeCount: record.nudgeCount + 1 }
        : {}),
    };

    this.byId.set(updated.id, updated);
    return updated;
  }

  override async listLapsed(at: Date, limit: number): Promise<readonly PaymentRequestRecord[]> {
    return [...this.byId.values()]
      .filter(
        (record) =>
          record.status === PaymentRequestStatus.OPEN && record.expiresAt.getTime() <= at.getTime(),
      )
      .sort((left, right) => left.expiresAt.getTime() - right.expiresAt.getTime())
      .slice(0, limit);
  }
}
