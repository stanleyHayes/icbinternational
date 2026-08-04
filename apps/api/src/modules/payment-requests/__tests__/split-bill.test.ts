import { type SplitBillRequest } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { IdGenerator } from '../../../common/ids/id-generator.js';
import { fromStored } from '../../../common/money/money.codec.js';
import { PaymentRequestService } from '../payment-request.service.js';
import { SplitBillService, sharesFor } from '../split-bill.service.js';

import {
  DESTINATION,
  frozenClock,
  RecordingNotifier,
  REQUESTER,
  requestStore,
  StubRequestFactory,
} from './request-harness.js';

function rig() {
  const clock = frozenClock();
  const requests = requestStore();
  const service = new PaymentRequestService(
    requests,
    new StubRequestFactory(clock).asFactory(),
    new RecordingNotifier(),
  );

  return { requests, service, splits: new SplitBillService(service, new IdGenerator()) };
}

function splitOf(overrides: Partial<SplitBillRequest> = {}): SplitBillRequest {
  return {
    destinationAccountId: DESTINATION,
    totalAmount: { amount: '10000', currency: 'GBP' },
    note: 'Dinner on Saturday',
    participants: [
      { name: 'Priya Raman', shares: 1 },
      { name: 'Tomasz Wójcik', shares: 1 },
    ],
    excludeSelf: true,
    ...overrides,
  } as SplitBillRequest;
}

const totalOf = (amounts: readonly { amount: string; currency: string }[]) =>
  amounts.reduce((sum, amount) => sum.plus(fromStored(amount)), Money.zero('GBP'));

describe('working out the shares', () => {
  it('counts the requester as a payer by default', () => {
    expect(sharesFor(splitOf())).toStrictEqual([1, 1, 1]);
  });

  it('leaves the requester out of the division when they are not paying', () => {
    expect(sharesFor(splitOf({ excludeSelf: false }))).toStrictEqual([1, 1]);
  });

  it('respects uneven shares', () => {
    const request = splitOf({
      participants: [
        { name: 'Priya Raman', shares: 3 },
        { name: 'Tomasz Wójcik', shares: 1 },
      ],
      excludeSelf: false,
    } as Partial<SplitBillRequest>);

    expect(sharesFor(request)).toStrictEqual([3, 1]);
  });
});

describe('splitting a bill', () => {
  it('raises one request per person', async () => {
    const { splits } = rig();
    const raised = await splits.split({ userId: REQUESTER, request: splitOf() });

    expect(raised).toHaveLength(2);
    expect(raised.map((request) => request.payeeName)).toStrictEqual([
      'Priya Raman',
      'Tomasz Wójcik',
    ]);
  });

  it('holds back the requester’s own share', async () => {
    const { splits } = rig();
    const raised = await splits.split({ userId: REQUESTER, request: splitOf() });

    // £100 across three, two of whom are asked: £33.34 + £33.33.
    expect(totalOf(raised.map((request) => request.amount)).toMajorString()).toBe('66.67');
  });

  it('asks for the whole total when the requester is not one of the payers', async () => {
    const { splits } = rig();
    const raised = await splits.split({
      userId: REQUESTER,
      request: splitOf({ excludeSelf: false }),
    });

    expect(totalOf(raised.map((request) => request.amount)).toMajorString()).toBe('100.00');
  });

  it('loses nothing to rounding on an amount that does not divide', async () => {
    const { splits } = rig();
    const raised = await splits.split({
      userId: REQUESTER,
      request: splitOf({
        totalAmount: { amount: '10000', currency: 'GBP' },
        participants: [
          { name: 'A', shares: 1 },
          { name: 'B', shares: 1 },
          { name: 'C', shares: 1 },
        ],
        excludeSelf: false,
      } as Partial<SplitBillRequest>),
    });

    expect(totalOf(raised.map((request) => request.amount)).toMajorString()).toBe('100.00');
  });

  it('divides in proportion to the shares each person agreed to', async () => {
    const { splits } = rig();
    const raised = await splits.split({
      userId: REQUESTER,
      request: splitOf({
        participants: [
          { name: 'Priya Raman', shares: 3 },
          { name: 'Tomasz Wójcik', shares: 1 },
        ],
        excludeSelf: false,
      } as Partial<SplitBillRequest>),
    });

    expect(fromStored(raised[0]!.amount).toMajorString()).toBe('75.00');
    expect(fromStored(raised[1]!.amount).toMajorString()).toBe('25.00');
  });

  it('groups every request under one split, so the requester can see who has paid', async () => {
    const { splits, service } = rig();
    const raised = await splits.split({ userId: REQUESTER, request: splitOf() });
    const splitId = raised[0]?.splitId ?? '';

    expect(splitId).not.toBe('');
    expect(await service.listSplit(splitId)).toHaveLength(2);
  });

  it('carries the note onto every request', async () => {
    const { splits } = rig();
    const raised = await splits.split({ userId: REQUESTER, request: splitOf() });

    expect(raised.every((request) => request.note === 'Dinner on Saturday')).toBe(true);
  });

  it('keeps each participant’s email against their own request', async () => {
    const { splits } = rig();
    const raised = await splits.split({
      userId: REQUESTER,
      request: splitOf({
        participants: [{ name: 'Priya Raman', email: 'priya@example.com', shares: 1 }],
        excludeSelf: false,
      } as Partial<SplitBillRequest>),
    });

    expect(raised[0]?.payeeEmail).toBe('priya@example.com');
  });
});
