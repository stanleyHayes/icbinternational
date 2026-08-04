import { Injectable } from '@nestjs/common';

import { type BillPaymentStatus } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';

import { BILL_PAYMENT_PAGE_SIZE } from './bill-pay.constants.js';
import { BillPaymentStore, type BillPaymentRecord } from './bill-payment.store.js';

/**
 * Reading a customer's payments back.
 *
 * Owner-scoped at the store, not filtered afterwards: there is no query here capable of
 * returning another customer's payment for something above it to check.
 */
@Injectable()
export class BillPaymentQueryService {
  constructor(private readonly payments: BillPaymentStore) {}

  async list(input: {
    userId: string;
    limit?: number;
    status?: BillPaymentStatus;
    billerId?: string;
  }): Promise<readonly BillPaymentRecord[]> {
    return this.payments.list({
      userId: input.userId,
      limit: input.limit ?? BILL_PAYMENT_PAGE_SIZE,
      ...(input.status ? { status: input.status } : {}),
      ...(input.billerId ? { billerId: input.billerId } : {}),
    });
  }

  async get(userId: string, paymentId: string): Promise<BillPaymentRecord> {
    const payment = await this.payments.findById(paymentId, userId);
    if (!payment) throw AppError.notFound('That payment', paymentId);
    return payment;
  }
}
