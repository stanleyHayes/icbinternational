import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AppConfigService } from '../config/config.service.js';

import { TransactionRunner } from './transaction.runner.js';

/**
 * The MongoDB connection.
 *
 * `w: 'majority'` and `readConcern: majority` are not tuning knobs here — they are what
 * make a committed transfer durable and a subsequent read see it. A ledger that
 * acknowledges a write the primary might still lose is not a ledger.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        uri: config.database.uri,
        dbName: config.database.name,
        writeConcern: { w: 'majority', journal: true },
        readConcern: { level: 'majority' },
        retryWrites: true,
        maxPoolSize: MAX_POOL_SIZE,
        minPoolSize: MIN_POOL_SIZE,
        serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
        autoIndex: !config.isProduction,
      }),
    }),
  ],
  providers: [TransactionRunner],
  exports: [MongooseModule, TransactionRunner],
})
export class DatabaseModule {}

const MAX_POOL_SIZE = 50;
const MIN_POOL_SIZE = 5;
const SERVER_SELECTION_TIMEOUT_MS = 8000;
