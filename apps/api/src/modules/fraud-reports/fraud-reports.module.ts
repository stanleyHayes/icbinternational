import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { AccountsModule } from '../accounts/index.js';
import { AuditModule } from '../audit/index.js';
import { AuthModule } from '../auth/auth.module.js';
import { CardsModule } from '../cards/index.js';
import { IdempotencyModule } from '../idempotency/index.js';
import { TicketsModule } from '../tickets/index.js';

import { FRAUD_REPORT_MODEL } from './fraud-report.constants.js';
import { FraudReportRepository } from './fraud-report.repository.js';
import { FraudReportSchema } from './fraud-report.schema.js';
import { FraudReportService } from './fraud-report.service.js';
import { FraudReportStore } from './fraud-report.store.js';
import { FraudReportsController } from './fraud-reports.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: FRAUD_REPORT_MODEL, schema: FraudReportSchema }]),
    AccountsModule,
    CardsModule,
    TicketsModule,
    AuthModule,
    IdempotencyModule,
    AuditModule,
  ],
  controllers: [FraudReportsController],
  providers: [
    FraudReportRepository,
    { provide: FraudReportStore, useExisting: FraudReportRepository },
    FraudReportService,
    IdGenerator,
  ],
  exports: [FraudReportStore, FraudReportService],
})
export class FraudReportsModule {}
