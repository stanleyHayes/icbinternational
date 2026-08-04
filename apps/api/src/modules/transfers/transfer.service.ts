import { Injectable, Logger } from '@nestjs/common';

import {
  ErrorCode,
  TransferStatus,
  type ListTransfersQuery,
  type Paginated,
  type Transfer,
} from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';

import { isCancellable } from './transfer-rules.js';
import { TIMELINE_DETAIL } from './transfer-timeline.js';
import { toContractTransfer } from './transfer.mapper.js';
import { TransferStore, type TransferRecord } from './transfer.store.js';

/**
 * Reading a customer's transfers, and the one thing they can still change about one.
 *
 * Execution lives in `InternalTransferUseCase`; this is the read path plus a cancel, which
 * keeps the file every controller touches free of the code that moves money.
 *
 * **Ownership is a `where` clause, not a check.** Every query here is scoped by `userId`
 * inside the filter, so there is no code path that reads a transfer by id alone and then
 * verifies it. A transfer belonging to somebody else answers `NOT_FOUND`, never
 * `FORBIDDEN` — a 403 would confirm the id belongs to a real payment.
 */
@Injectable()
export class TransferService {
  private readonly logger = new Logger(TransferService.name);

  constructor(
    private readonly transfers: TransferStore,
    private readonly clock: ClockService,
  ) {}

  /** A cursor-paginated page of the customer's transfers, newest first. */
  async list(userId: string, query: ListTransfersQuery): Promise<Paginated<Transfer>> {
    const page = await this.transfers.list({
      userId,
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.rail ? { rail: query.rail } : {}),
      ...(query.sourceAccountId ? { sourceAccountId: query.sourceAccountId } : {}),
    });

    return { data: page.data.map((record) => toContractTransfer(record)), page: page.page };
  }

  async get(userId: string, transferId: string): Promise<Transfer> {
    return toContractTransfer(await this.requireOwned(userId, transferId));
  }

  /**
   * Calls off a transfer that has not gone yet.
   *
   * The write is conditional on the transfer still being in a cancellable status, which is
   * what makes cancelling exactly-once: two taps both read a pending transfer, both attempt
   * the transition, and the database picks one. The loser is told
   * `TRANSFER_NOT_CANCELLABLE`, which is true — by then it is not.
   *
   * An internal transfer settles inside the transaction that creates it, so in practice
   * this always refuses one. That is the honest answer rather than a missing feature: the
   * payee already has the money, and getting it back is a recall, not a cancellation.
   *
   * @throws {AppError} `NOT_FOUND` or `TRANSFER_NOT_CANCELLABLE`.
   */
  async cancel(userId: string, transferId: string): Promise<Transfer> {
    const record = await this.requireOwned(userId, transferId);
    if (!isCancellable(record.status)) throw notCancellable(record);

    const at = this.clock.now();
    const cancelled = await this.transfers.transition({
      id: record.id,
      userId,
      fromStatuses: cancellableStatuses(),
      status: TransferStatus.CANCELLED,
      event: { status: TransferStatus.CANCELLED, at, detail: TIMELINE_DETAIL.cancelled },
      settledAt: null,
    });

    if (!cancelled) throw notCancellable(record);

    this.logger.log(`Cancelled transfer ${record.id}`);
    return toContractTransfer(cancelled);
  }

  /** The transfer, or `NOT_FOUND` if it is missing *or* not this customer's. */
  async requireOwned(userId: string, transferId: string): Promise<TransferRecord> {
    const record = await this.transfers.findById(transferId, userId);
    if (!record) throw AppError.notFound('Transfer', transferId);
    return record;
  }
}

/** The statuses the conditional write will accept as a starting point. */
function cancellableStatuses(): TransferStatus[] {
  return Object.values(TransferStatus).filter((status) => isCancellable(status));
}

function notCancellable(record: TransferRecord): AppError {
  return new AppError({
    code: ErrorCode.TRANSFER_NOT_CANCELLABLE,
    message:
      record.status === TransferStatus.SETTLED
        ? 'This payment has already reached the payee and cannot be cancelled.'
        : `A payment that is ${record.status.toLowerCase()} cannot be cancelled.`,
    context: { transferId: record.id, status: record.status },
  });
}
