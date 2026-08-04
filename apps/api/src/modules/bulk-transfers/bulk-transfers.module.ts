import { Module } from '@nestjs/common';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { AuthModule } from '../auth/auth.module.js';

import { BulkTransferStore } from './bulk-transfer.store.js';
import { BulkTransfersController } from './bulk-transfers.controller.js';

/**
 * Bulk payment processing.
 *
 * Allows a customer to submit a batch of transfers (e.g. a payroll run) as a single
 * operation. Requires a second-user approval before processing starts.
 *
 * CSV parsing, async processing, and the debit/credit leg implementation are deferred.
 * This module wires the route surface so the operations console and the web app can
 * call through.
 */
@Module({
  imports: [AuthModule],
  controllers: [BulkTransfersController],
  providers: [BulkTransferStore, IdGenerator],
  exports: [BulkTransferStore],
})
export class BulkTransfersModule {}
