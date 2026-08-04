import { Module } from '@nestjs/common';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { AuthModule } from '../auth/auth.module.js';

import { BusinessController } from './business.controller.js';
import { BusinessStore } from './business.store.js';

/**
 * Business banking module.
 *
 * Multi-user account surface: members, approvals, invoices and payroll. Each of these
 * resources is scoped to the authenticated user's business account. The approval
 * workflow enforces a two-user sign-off — a payment or payroll run submitted by one
 * member must be confirmed by a second.
 *
 * All stores are in-memory for this increment. MongoDB persistence, direct debit
 * integration for payroll, and invoice financing are deferred.
 */
@Module({
  imports: [AuthModule],
  controllers: [BusinessController],
  providers: [BusinessStore, IdGenerator],
  exports: [BusinessStore],
})
export class BusinessModule {}
