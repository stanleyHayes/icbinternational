import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';

import {
  ErrorCode,
  routes,
  type BulkTransfer,
} from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { IdGenerator } from '../../common/ids/id-generator.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

import { BulkTransferStore } from './bulk-transfer.store.js';

/**
 * Bulk transfer endpoints.
 *
 * The bulk transfer flow is:
 * 1. A customer POSTs a CSV (or JSON batch) → `AWAITING_APPROVAL`.
 * 2. A second authorised user approves → `PROCESSING` → `COMPLETED`.
 *
 * For the demo increment the CSV is not actually parsed; the endpoint accepts a JSON
 * payload with pre-validated rows. CSV parsing and the async processing pipeline are a
 * subsequent increment.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class BulkTransfersController {
  constructor(
    private readonly store: BulkTransferStore,
    private readonly ids: IdGenerator,
    private readonly clock: ClockService,
  ) {}

  /**
   * `POST /bulk-transfers` — submit a new bulk transfer batch.
   *
   * In this increment accepts a JSON body with a `sourceAccountId` and an array of rows.
   * A production version would accept `multipart/form-data` with the CSV file.
   */
  @Post(routes.bulkTransfers.create)
  create(@CurrentUser() _user: AuthenticatedUser, @Body() body: Record<string, unknown>): BulkTransfer {
    const id = this.ids.generate('bulkTransfer' as never);
    const transfer: BulkTransfer = {
      id,
      sourceAccountId: (body.sourceAccountId as `acc_${string}`) ?? (`acc_${id}` as `acc_${string}`),
      fileName: (body.fileName as string) ?? 'upload.json',
      status: 'AWAITING_APPROVAL',
      totalRows: 0,
      validRows: 0,
      failedRows: 0,
      totalAmount: { amount: '0', currency: 'GBP' },
      rows: [],
      createdAt: this.clock.now().toISOString(),
      completedAt: null,
    };
    this.store.insert(transfer);
    return transfer;
  }

  /** `GET /bulk-transfers/:id` */
  @Get(routes.bulkTransfers.byId(':id'))
  getById(@Param('id') id: string): BulkTransfer {
    const transfer = this.store.findById(id);
    if (!transfer) throw new AppError({ code: ErrorCode.NOT_FOUND, message: 'Bulk transfer not found' });
    return transfer;
  }

  /**
   * `POST /bulk-transfers/:id/approve` — advance a batch from `AWAITING_APPROVAL`
   * to `PROCESSING`. A second user must call this; the approver cannot be the
   * same session that created the batch (enforced by the service in a full implementation).
   */
  @Post(routes.bulkTransfers.approve(':id'))
  @HttpCode(HttpStatus.OK)
  approve(@Param('id') id: string): BulkTransfer {
    const transfer = this.store.findById(id);
    if (!transfer) throw new AppError({ code: ErrorCode.NOT_FOUND, message: 'Bulk transfer not found' });
    if (transfer.status !== 'AWAITING_APPROVAL') {
      throw new AppError({ code: ErrorCode.CONFLICT, message: 'Batch is not awaiting approval' });
    }
    const updated = this.store.patch(id, {
      status: 'PROCESSING',
      completedAt: null,
    });
    if (!updated) {
      throw new AppError({ code: ErrorCode.NOT_FOUND, message: 'Bulk transfer not found' });
    }
    return updated;
  }
}
