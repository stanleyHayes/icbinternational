import { Injectable, Logger } from '@nestjs/common';

import { type PaymentRequestRecord } from './payment-request.store.js';

/** What happened to a request that somebody should hear about. */
export const RequestEvent = {
  RAISED: 'RAISED',
  NUDGED: 'NUDGED',
  PAID: 'PAID',
  DECLINED: 'DECLINED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
} as const;
export type RequestEvent = (typeof RequestEvent)[keyof typeof RequestEvent];

/**
 * How a payment request reaches the people involved.
 *
 * A port, because telling somebody something belongs to the communications lane. This lane
 * decides *that* a request was raised, chased, paid or left to lapse; somebody else decides
 * whether that becomes an email, a push notification or a row in a feed.
 */
export abstract class PaymentRequestNotifierPort {
  abstract announce(event: RequestEvent, request: PaymentRequestRecord): Promise<void>;
}

/**
 * The default binding: record it and move on.
 *
 * Honest rather than silent. Until the communications lane binds a real notifier the event
 * is written to the log with everything needed to reconstruct it, so the request lifecycle
 * genuinely works and only delivery is missing. What it will never do is pretend a message
 * was sent.
 */
@Injectable()
export class LoggingPaymentRequestNotifier extends PaymentRequestNotifierPort {
  private readonly logger = new Logger(LoggingPaymentRequestNotifier.name);

  override async announce(event: RequestEvent, request: PaymentRequestRecord): Promise<void> {
    this.logger.log(
      `Payment request ${request.id} ${event.toLowerCase()} — ${request.requesterName} asked ${request.payeeName ?? 'anyone with the link'} for ${request.amount.amount} ${request.amount.currency}`,
    );
  }
}
