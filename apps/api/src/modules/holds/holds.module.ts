import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { TransactionRunner } from '../../database/transaction.runner.js';
import { AccountsModule } from '../accounts/index.js';

import { BalanceService } from './balance.service.js';
import { HoldCaptureService } from './hold-capture.service.js';
import { HOLD_MODEL } from './hold.constants.js';
import { HoldRepository } from './hold.repository.js';
import { HoldSchema } from './hold.schema.js';
import { HoldService } from './hold.service.js';
import { HoldStore } from './hold.store.js';

/**
 * Balances and holds.
 *
 * Depends on `AccountsModule` and is depended on by nobody in that direction — holds live
 * on accounts, not the other way round. The one place the dependency could have inverted
 * is the closure guard, which has to refuse an account with a live hold; it reads
 * `holdTotal` from the account document instead, which this module maintains inside the
 * same transaction that places or releases a hold. One field, one writer, no cycle.
 *
 * `PostingService` comes from `AccountsModule` rather than `LedgerModule`, because that is
 * the instance bound to the Mongo-backed `AccountBalancePort` — see the note on
 * `AccountsModule` for why the ledger's own instance is not the one that should be moving
 * customer balances yet.
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: HOLD_MODEL, schema: HoldSchema }]), AccountsModule],
  providers: [
    { provide: HoldStore, useClass: HoldRepository },
    BalanceService,
    HoldService,
    HoldCaptureService,
    IdGenerator,
    TransactionRunner,
  ],
  exports: [HoldStore, BalanceService, HoldService, HoldCaptureService],
})
export class HoldsModule {}
