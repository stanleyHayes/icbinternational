import { ErrorCode, PaymentRequestStatus } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { AppError } from '../../../common/errors/app-error.js';
import { PaymentRequestSettlementService } from '../payment-request-settlement.service.js';
import { toContractPaymentRequest } from '../payment-request.mapper.js';
import { PaymentRequestService } from '../payment-request.service.js';

import {
  DESTINATION,
  fakeRunner,
  frozenClock,
  PAYER,
  PAYER_ACCOUNT,
  RecordingNotifier,
  RecordingRequestPoster,
  REQUESTER,
  requestStore,
  StubAccounts,
  StubRequestFactory,
} from './request-harness.js';

const HOUR_MS = 3_600_000;
const DEFAULT_WINDOW_MS = 72 * HOUR_MS;

function rig() {
  const clock = frozenClock();
  const requests = requestStore();
  const factory = new StubRequestFactory(clock);
  const notifier = new RecordingNotifier();
  const service = new PaymentRequestService(requests, factory.asFactory(), notifier);

  const poster = new RecordingRequestPoster(clock);
  const settlement = new PaymentRequestSettlementService(
    requests,
    new StubAccounts().asService(),
    poster.asPoster(),
    fakeRunner(),
  );

  return { clock, requests, notifier, service, poster, settlement };
}

async function raise(service: PaymentRequestService, expiresInHours?: number) {
  return service.create({
    userId: REQUESTER,
    destinationAccountId: DESTINATION,
    amount: Money.fromMajor('25.00', 'GBP'),
    note: 'Dinner on Saturday',
    ...(expiresInHours === undefined ? {} : { expiresInHours }),
  });
}

const payWith = (settlement: PaymentRequestSettlementService, requestId: string) =>
  settlement.pay({
    requestId,
    payerUserId: PAYER,
    payerName: 'Tomasz Wójcik',
    sourceAccountId: PAYER_ACCOUNT,
  });

async function codeOf(work: Promise<unknown>): Promise<string> {
  try {
    await work;
  } catch (error) {
    return error instanceof AppError ? error.code : 'NOT_AN_APP_ERROR';
  }

  return 'NO_ERROR_THROWN';
}

describe('raising a request', () => {
  it('produces a link and a QR payload built from one token', async () => {
    const { service } = rig();
    const wire = toContractPaymentRequest(await raise(service));

    expect(wire.shareUrl).toContain('https://pay.reliancebank.example/r/');
    expect(wire.qrPayload).toContain('reliance://pay/');
    expect(wire.qrPayload.split('/').at(-1)).toBe(wire.shareUrl.split('/').at(-1));
  });

  it('takes the requester name from their profile, not from the request', async () => {
    const { service } = rig();
    expect((await raise(service)).requesterName).toBe('Amara Nwosu');
  });

  it('tells somebody the request exists', async () => {
    const { service, notifier } = rig();
    const request = await raise(service);

    expect(notifier.events).toStrictEqual([{ event: 'RAISED', id: request.id }]);
  });

  it('never puts the token on the wire object itself', async () => {
    const { service } = rig();
    expect(toContractPaymentRequest(await raise(service))).not.toHaveProperty('token');
  });
});

/** The property this lane exists to protect. */
describe('an expired request', () => {
  it('cannot be paid', async () => {
    const { service, settlement, clock, poster } = rig();
    const request = await raise(service);

    clock.advance(DEFAULT_WINDOW_MS + 1);

    expect(await codeOf(payWith(settlement, request.id))).toBe(ErrorCode.PAYMENT_REQUEST_EXPIRED);
    expect(poster.settled).toStrictEqual([]);
  });

  it('is closed by the sweep, so the requester’s list tells the truth', async () => {
    const { service, clock } = rig();
    const request = await raise(service);

    clock.advance(DEFAULT_WINDOW_MS + 1);

    expect(await service.expireLapsed()).toBe(1);
    expect((await service.get(request.id)).status).toBe(PaymentRequestStatus.EXPIRED);
  });

  it('is closed on being read, without waiting for the sweep', async () => {
    const { service, clock } = rig();
    const request = await raise(service);

    clock.advance(DEFAULT_WINDOW_MS + 1);

    expect((await service.get(request.id)).status).toBe(PaymentRequestStatus.EXPIRED);
  });

  it('honours a shorter window the requester chose', async () => {
    const { service, settlement, clock } = rig();
    const request = await raise(service, 1);

    clock.advance(HOUR_MS + 1);

    expect(await codeOf(payWith(settlement, request.id))).toBe(ErrorCode.PAYMENT_REQUEST_EXPIRED);
  });

  it('is still payable a minute before it lapses', async () => {
    const { service, settlement, clock } = rig();
    const request = await raise(service);

    clock.advance(DEFAULT_WINDOW_MS - 60_000);

    expect((await payWith(settlement, request.id)).status).toBe(PaymentRequestStatus.PAID);
  });
});

describe('paying a request', () => {
  it('moves the money and records who paid', async () => {
    const { service, settlement, poster } = rig();
    const request = await raise(service);

    const paid = await payWith(settlement, request.id);

    expect(paid.status).toBe(PaymentRequestStatus.PAID);
    expect(paid.paidByName).toBe('Tomasz Wójcik');
    expect(paid.journalEntryId).toBe(`jnl_${request.id}`);
    expect(poster.settled).toStrictEqual([request.id]);
  });

  it('pays once, however many times the link is tapped', async () => {
    const { service, settlement, poster } = rig();
    const request = await raise(service);

    await payWith(settlement, request.id);
    expect(await codeOf(payWith(settlement, request.id))).toBe(ErrorCode.CONFLICT);
    expect(poster.settled).toHaveLength(1);
  });

  it('refuses to pay a request into the account it is asking to be paid from', async () => {
    const { service, settlement } = rig();
    const request = await raise(service);

    expect(
      await codeOf(
        settlement.pay({
          requestId: request.id,
          payerUserId: REQUESTER,
          payerName: 'Amara Nwosu',
          sourceAccountId: DESTINATION,
        }),
      ),
    ).toBe(ErrorCode.SAME_ACCOUNT_TRANSFER);
  });

  it('refuses a request that does not exist', async () => {
    const { settlement } = rig();
    expect(await codeOf(payWith(settlement, 'tro_01JQ8Z0000000000000000000Z'))).toBe(
      ErrorCode.NOT_FOUND,
    );
  });
});

describe('closing a request', () => {
  it('is a cancellation when the requester does it', async () => {
    const { service } = rig();
    const request = await raise(service);

    const closed = await service.close({ id: request.id, userId: REQUESTER });
    expect(closed.status).toBe(PaymentRequestStatus.CANCELLED);
  });

  it('is a decline when anybody else does it', async () => {
    const { service } = rig();
    const request = await raise(service);

    const closed = await service.close({ id: request.id, userId: PAYER });
    expect(closed.status).toBe(PaymentRequestStatus.DECLINED);
  });

  it('cannot be paid once it is closed', async () => {
    const { service, settlement } = rig();
    const request = await raise(service);
    await service.close({ id: request.id, userId: PAYER });

    expect(await codeOf(payWith(settlement, request.id))).toBe(ErrorCode.CONFLICT);
  });
});

describe('nudging', () => {
  const DAY_MS = 24 * HOUR_MS;

  it('sends a reminder and counts it', async () => {
    const { service, notifier } = rig();
    const request = await raise(service);

    const nudged = await service.nudge({ id: request.id, userId: REQUESTER });

    expect(nudged.nudgeCount).toBe(1);
    expect(notifier.events.at(-1)).toStrictEqual({ event: 'NUDGED', id: request.id });
  });

  it('will not send two in a day', async () => {
    const { service } = rig();
    const request = await raise(service);
    await service.nudge({ id: request.id, userId: REQUESTER });

    expect(await codeOf(service.nudge({ id: request.id, userId: REQUESTER }))).toBe(
      ErrorCode.RATE_LIMITED,
    );
  });

  it('stops after three, however long the requester waits', async () => {
    const { service, clock } = rig();
    const request = await raise(service, 720);

    for (let index = 0; index < 3; index += 1) {
      await service.nudge({ id: request.id, userId: REQUESTER });
      clock.advance(DAY_MS + 1);
    }

    expect(await codeOf(service.nudge({ id: request.id, userId: REQUESTER }))).toBe(
      ErrorCode.LIMIT_EXCEEDED,
    );
  });

  it('is only for the person who raised the request', async () => {
    const { service } = rig();
    const request = await raise(service);

    expect(await codeOf(service.nudge({ id: request.id, userId: PAYER }))).toBe(
      ErrorCode.FORBIDDEN,
    );
  });
});
