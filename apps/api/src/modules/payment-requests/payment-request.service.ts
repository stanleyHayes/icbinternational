import { Injectable } from '@nestjs/common';

import { ErrorCode, PaymentRequestStatus } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';

import { PaymentRequestNotifierPort, RequestEvent } from './payment-request-notifier.port.js';
import {
  MAX_NUDGES,
  MIN_NUDGE_INTERVAL_HOURS,
  MS_PER_HOUR,
  MS_PER_SECOND,
  REQUEST_EXPIRY_BATCH,
} from './payment-request.constants.js';
import { PaymentRequestFactory, type RequestDraft } from './payment-request.factory.js';
import { PaymentRequestStore, type PaymentRequestRecord } from './payment-request.store.js';

/** Requests returned by the customer's list when no limit is given. */
const LIST_LIMIT = 50;

/** The statuses a request may still be paid, declined or cancelled from. */
export const LIVE_STATUSES: readonly PaymentRequestStatus[] = [PaymentRequestStatus.OPEN];

/**
 * Raising, chasing and withdrawing a request for money.
 *
 * **A request that has lapsed is not paid, and not quietly revived.** Expiry is enforced in
 * two places for two different reasons: a job sweeps lapsed requests so the requester's list
 * tells the truth without anybody having to open it, and every read checks the window so a
 * request that lapsed thirty seconds ago is never shown as payable. Neither is decorative —
 * the sweep alone would leave a stale `OPEN`, and the read check alone would leave a list
 * full of requests that only expire when looked at.
 *
 * **Nudges are bounded.** Three reminders, no more than one a day. A "remind them" button
 * with no ceiling is a harassment tool wearing a bank's logo, and the person on the other
 * end did not agree to anything.
 */
@Injectable()
export class PaymentRequestService {
  constructor(
    private readonly requests: PaymentRequestStore,
    private readonly factory: PaymentRequestFactory,
    private readonly notifier: PaymentRequestNotifierPort,
  ) {}

  /** Raises a request and returns it with its link. */
  async create(draft: RequestDraft): Promise<PaymentRequestRecord> {
    const request = await this.requests.insert(await this.factory.build(draft));
    await this.notifier.announce(RequestEvent.RAISED, request);
    return request;
  }

  /** The customer's own requests, newest first, with any lapsed ones already closed. */
  async list(userId: string): Promise<readonly PaymentRequestRecord[]> {
    const records = await this.requests.listByRequester(userId, LIST_LIMIT);
    return Promise.all(records.map(async (record) => this.settleLapsed(record)));
  }

  /**
   * The request behind a link.
   *
   * Deliberately not owner-scoped: the person opening the link is not the person who
   * created it. What protects the request is that its id and token are unguessable.
   */
  async get(id: string): Promise<PaymentRequestRecord> {
    const record = await this.requests.findById(id);
    if (!record) throw AppError.notFound('That payment request', id);
    return this.settleLapsed(record);
  }

  /** Every request raised by one split, so the requester can see who has paid. */
  async listSplit(splitId: string): Promise<readonly PaymentRequestRecord[]> {
    return this.requests.listBySplit(splitId);
  }

  /**
   * Withdraws a request, or turns one down.
   *
   * One operation with two meanings, decided by who is asking: the requester withdrawing
   * their own ask is a cancellation, and anybody else saying no is a decline. Both close
   * the request and neither moves money, so modelling them as two endpoints would give the
   * client two ways to express the same intent and the bank two code paths to keep in step.
   */
  async close(input: { id: string; userId: string }): Promise<PaymentRequestRecord> {
    const request = await this.get(input.id);
    const isRequester = request.userId === input.userId;
    const status = isRequester ? PaymentRequestStatus.CANCELLED : PaymentRequestStatus.DECLINED;

    const closed = await this.requests.transition({
      id: request.id,
      fromStatuses: LIVE_STATUSES,
      status,
    });

    if (!closed) throw notLive(request);

    await this.notifier.announce(
      isRequester ? RequestEvent.CANCELLED : RequestEvent.DECLINED,
      closed,
    );
    return closed;
  }

  /**
   * Sends a reminder.
   *
   * @throws {AppError} `LIMIT_EXCEEDED` past {@link MAX_NUDGES} or inside the quiet window.
   */
  async nudge(input: { id: string; userId: string }): Promise<PaymentRequestRecord> {
    const request = await this.get(input.id);
    if (request.userId !== input.userId) {
      throw AppError.forbidden('Only the person who raised a request can send a reminder.');
    }

    assertNudgeable(request, this.factory.now());

    const nudged = await this.requests.transition({
      id: request.id,
      fromStatuses: LIVE_STATUSES,
      status: PaymentRequestStatus.OPEN,
      nudgedAt: this.factory.now(),
    });

    if (!nudged) throw notLive(request);

    await this.notifier.announce(RequestEvent.NUDGED, nudged);
    return nudged;
  }

  /** One sweep: closes every request whose window has passed. */
  async expireLapsed(): Promise<number> {
    const lapsed = await this.requests.listLapsed(this.factory.now(), REQUEST_EXPIRY_BATCH);
    let closed = 0;

    for (const record of lapsed) {
      if (await this.expire(record)) closed += 1;
    }

    return closed;
  }

  /** Closes one request that has run out of time, if nobody beat us to it. */
  private async expire(record: PaymentRequestRecord): Promise<boolean> {
    const expired = await this.requests.transition({
      id: record.id,
      fromStatuses: LIVE_STATUSES,
      status: PaymentRequestStatus.EXPIRED,
    });

    if (!expired) return false;

    await this.notifier.announce(RequestEvent.EXPIRED, expired);
    return true;
  }

  /** A read of a lapsed request closes it, so nothing is ever shown as payable when it is not. */
  private async settleLapsed(record: PaymentRequestRecord): Promise<PaymentRequestRecord> {
    if (record.status !== PaymentRequestStatus.OPEN) return record;
    if (record.expiresAt.getTime() > this.factory.now().getTime()) return record;

    return (await this.expire(record))
      ? { ...record, status: PaymentRequestStatus.EXPIRED }
      : record;
  }
}

/** The single rejection for acting on a request that is no longer live. */
export function notLive(request: PaymentRequestRecord): AppError {
  const expired = request.status === PaymentRequestStatus.EXPIRED;

  return new AppError({
    code: expired ? ErrorCode.PAYMENT_REQUEST_EXPIRED : ErrorCode.CONFLICT,
    message: expired
      ? 'This request has expired. Ask for a new link.'
      : 'This request has already been settled or withdrawn.',
    context: { requestId: request.id, status: request.status },
  });
}

function assertNudgeable(request: PaymentRequestRecord, at: Date): void {
  if (request.nudgeCount >= MAX_NUDGES) {
    throw new AppError({
      code: ErrorCode.LIMIT_EXCEEDED,
      message: `You have sent the maximum of ${MAX_NUDGES} reminders for this request.`,
    });
  }

  const since = at.getTime() - (request.lastNudgedAt?.getTime() ?? 0);
  if (request.lastNudgedAt && since < MIN_NUDGE_INTERVAL_HOURS * MS_PER_HOUR) {
    throw new AppError({
      code: ErrorCode.RATE_LIMITED,
      message: 'You can send another reminder tomorrow.',
      retryAfterSeconds: Math.ceil(
        (MIN_NUDGE_INTERVAL_HOURS * MS_PER_HOUR - since) / MS_PER_SECOND,
      ),
    });
  }
}
