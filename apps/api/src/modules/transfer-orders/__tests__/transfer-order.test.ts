import { RecurrenceFrequency, TransferOrderStatus } from '@reliance/contracts';

import { toContractTransferOrder } from '../transfer-order.mapper.js';

import {
  ACCOUNT,
  codeOf,
  CUSTOMER,
  orderRequest,
  PAYEE,
  rig,
  STRANGER,
  TODAY,
} from './transfer-order-harness.js';

describe('setting up a standing order', () => {
  it('books the first payment on the start date', async () => {
    const { service } = rig();

    const order = await service.create({ userId: CUSTOMER, request: orderRequest() });

    expect(order.status).toBe(TransferOrderStatus.ACTIVE);
    expect(order.nextRunAt?.toISOString()).toBe('2026-08-31T00:00:00.000Z');
    expect(order.occurrencesRun).toBe(0);
  });

  it('defaults the day of the month from the start date', async () => {
    const { service } = rig();

    const order = await service.create({
      userId: CUSTOMER,
      request: orderRequest({ startsOn: '2026-09-12', dayOfMonth: undefined }),
    });

    expect(order.dayOfMonth).toBe(12);
    expect(order.dayOfWeek).toBeNull();
  });

  it('refuses an account the customer does not hold', async () => {
    const { service } = rig();

    const code = await codeOf(service.create({ userId: STRANGER, request: orderRequest() }));

    expect(code).toBe('ACCOUNT_NOT_FOUND');
  });

  it('refuses a payee the customer has not saved', async () => {
    const { service } = rig();
    const request = orderRequest({ beneficiaryId: 'ben_01JQ8Z000000000000000000ZZ' });

    expect(await codeOf(service.create({ userId: CUSTOMER, request }))).toBe(
      'BENEFICIARY_NOT_FOUND',
    );
  });

  it('refuses an amount in a currency the account does not hold', async () => {
    const { service } = rig();
    const request = orderRequest({ amount: { amount: '25000', currency: 'EUR' } });

    expect(await codeOf(service.create({ userId: CUSTOMER, request }))).toBe('CURRENCY_MISMATCH');
  });

  it('refuses an amount of nothing, which the contract schema lets through', async () => {
    const { service } = rig();
    const request = orderRequest({ amount: { amount: '0', currency: 'GBP' } });

    expect(await codeOf(service.create({ userId: CUSTOMER, request }))).toBe('INVALID_AMOUNT');
  });

  it('refuses a start date in the past', async () => {
    const { service } = rig();
    const request = orderRequest({ startsOn: '2026-07-01' });

    expect(await codeOf(service.create({ userId: CUSTOMER, request }))).toBe('VALIDATION_FAILED');
  });

  it('refuses a schedule with no payment date in it', async () => {
    const { service } = rig();
    const request = orderRequest({ startsOn: '2026-09-30', endsOn: '2026-10-01', dayOfMonth: 15 });

    expect(await codeOf(service.create({ userId: CUSTOMER, request }))).toBe('VALIDATION_FAILED');
  });
});

describe('reading someone else’s standing order', () => {
  it('answers not-found rather than forbidden', async () => {
    const { service } = rig();
    const order = await service.create({ userId: CUSTOMER, request: orderRequest() });

    expect(await codeOf(service.get(STRANGER, order.id))).toBe('NOT_FOUND');
  });

  it('keeps it out of the other customer’s list', async () => {
    const { service } = rig();
    await service.create({ userId: CUSTOMER, request: orderRequest() });

    const page = await service.list(STRANGER, { limit: 10 });

    expect(page.data).toHaveLength(0);
  });

  it('narrows the list to one source account when asked', async () => {
    const { service } = rig();
    await service.create({ userId: CUSTOMER, request: orderRequest() });

    const mine = await service.list(CUSTOMER, { limit: 10, sourceAccountId: ACCOUNT });
    const elsewhere = await service.list(CUSTOMER, {
      limit: 10,
      sourceAccountId: 'acc_01JQ8Z000000000000000000ZZ',
    });

    expect(mine.data).toHaveLength(1);
    expect(elsewhere.data).toHaveLength(0);
  });
});

describe('pausing', () => {
  it('keeps the payment date it was heading for', async () => {
    const { service, lifecycle } = rig();
    const order = await service.create({ userId: CUSTOMER, request: orderRequest() });

    const paused = await lifecycle.setPaused({
      userId: CUSTOMER,
      orderId: order.id,
      request: { paused: true },
    });

    expect(paused.status).toBe(TransferOrderStatus.PAUSED);
    expect(paused.nextRunAt).toEqual(order.nextRunAt);
  });

  it('rejoins the same cadence on resume rather than paying the months it missed', async () => {
    const { service, lifecycle, clock } = rig();
    const order = await service.create({ userId: CUSTOMER, request: orderRequest() });
    await lifecycle.setPaused({ userId: CUSTOMER, orderId: order.id, request: { paused: true } });

    // Three months of the clock pass while the order is paused.
    clock.freezeAt(new Date('2026-11-15T09:00:00.000Z'));
    const resumed = await lifecycle.setPaused({
      userId: CUSTOMER,
      orderId: order.id,
      request: { paused: false },
    });

    expect(resumed.status).toBe(TransferOrderStatus.ACTIVE);
    expect(resumed.nextRunAt?.toISOString()).toBe('2026-11-30T00:00:00.000Z');
    expect(resumed.occurrencesRun).toBe(0);
  });

  it('refuses a resume date, because nothing in the bank would act on one', async () => {
    const { service, lifecycle } = rig();
    const order = await service.create({ userId: CUSTOMER, request: orderRequest() });

    const code = await codeOf(
      lifecycle.setPaused({
        userId: CUSTOMER,
        orderId: order.id,
        request: { paused: true, resumeOn: '2026-12-01' },
      }),
    );

    expect(code).toBe('FEATURE_DISABLED');
  });
});

describe('skipping', () => {
  it('drops one occurrence and leaves the schedule running', async () => {
    const { service, lifecycle } = rig();
    const order = await service.create({ userId: CUSTOMER, request: orderRequest() });

    const skipped = await lifecycle.skipNext({ userId: CUSTOMER, orderId: order.id });

    expect(skipped.status).toBe(TransferOrderStatus.ACTIVE);
    expect(skipped.nextRunAt?.toISOString()).toBe('2026-09-30T00:00:00.000Z');
  });

  it('does not count the skipped occurrence against the payment cap', async () => {
    const { service, lifecycle } = rig();
    const order = await service.create({
      userId: CUSTOMER,
      request: orderRequest({ maxOccurrences: 2 }),
    });

    const skipped = await lifecycle.skipNext({ userId: CUSTOMER, orderId: order.id });

    expect(skipped.occurrencesRun).toBe(0);
    expect(skipped.nextRunAt).not.toBeNull();
  });

  it('finishes the order when the skip runs past the end date', async () => {
    const { service, lifecycle } = rig();
    const order = await service.create({
      userId: CUSTOMER,
      request: orderRequest({ endsOn: '2026-09-15' }),
    });

    const skipped = await lifecycle.skipNext({ userId: CUSTOMER, orderId: order.id });

    expect(skipped.status).toBe(TransferOrderStatus.COMPLETED);
    expect(skipped.nextRunAt).toBeNull();
  });

  it('refuses on a paused order, which has nothing due to skip', async () => {
    const { service, lifecycle } = rig();
    const order = await service.create({ userId: CUSTOMER, request: orderRequest() });
    await lifecycle.setPaused({ userId: CUSTOMER, orderId: order.id, request: { paused: true } });

    expect(await codeOf(lifecycle.skipNext({ userId: CUSTOMER, orderId: order.id }))).toBe(
      'CONFLICT',
    );
  });
});

describe('stopping', () => {
  it('clears the next payment and refuses every later change', async () => {
    const { service, lifecycle } = rig();
    const order = await service.create({ userId: CUSTOMER, request: orderRequest() });

    await lifecycle.cancel({ userId: CUSTOMER, orderId: order.id });
    const stopped = await service.get(CUSTOMER, order.id);

    expect(stopped.status).toBe(TransferOrderStatus.CANCELLED);
    expect(stopped.nextRunAt).toBeNull();
    expect(await codeOf(lifecycle.skipNext({ userId: CUSTOMER, orderId: order.id }))).toBe(
      'CONFLICT',
    );
  });

  it('is idempotent, so a second press is not an error', async () => {
    const { service, lifecycle } = rig();
    const order = await service.create({ userId: CUSTOMER, request: orderRequest() });

    await lifecycle.cancel({ userId: CUSTOMER, orderId: order.id });

    await expect(
      lifecycle.cancel({ userId: CUSTOMER, orderId: order.id }),
    ).resolves.toBeUndefined();
  });

  it('will not stop an order belonging to somebody else', async () => {
    const { service, lifecycle } = rig();
    const order = await service.create({ userId: CUSTOMER, request: orderRequest() });

    expect(await codeOf(lifecycle.cancel({ userId: STRANGER, orderId: order.id }))).toBe(
      'NOT_FOUND',
    );
  });
});

describe('amending', () => {
  it('changes the amount from the next payment onwards', async () => {
    const { service, lifecycle } = rig();
    const order = await service.create({ userId: CUSTOMER, request: orderRequest() });

    const amended = await lifecycle.amend({
      userId: CUSTOMER,
      orderId: order.id,
      request: { amount: { amount: '27500', currency: 'GBP' } },
    });

    expect(amended.amount).toEqual({ amount: '27500', currency: 'GBP' });
    expect(amended.nextRunAt).toEqual(order.nextRunAt);
  });

  it('refuses a new amount in a different currency', async () => {
    const { service, lifecycle } = rig();
    const order = await service.create({ userId: CUSTOMER, request: orderRequest() });

    const code = await codeOf(
      lifecycle.amend({
        userId: CUSTOMER,
        orderId: order.id,
        request: { amount: { amount: '27500', currency: 'USD' } },
      }),
    );

    expect(code).toBe('CURRENCY_MISMATCH');
  });

  it('finishes an order whose new end date falls before the next payment', async () => {
    const { service, lifecycle } = rig();
    const order = await service.create({ userId: CUSTOMER, request: orderRequest() });
    await lifecycle.skipNext({ userId: CUSTOMER, orderId: order.id });

    const amended = await lifecycle.amend({
      userId: CUSTOMER,
      orderId: order.id,
      request: { endsOn: '2026-09-15' },
    });

    expect(amended.status).toBe(TransferOrderStatus.COMPLETED);
    expect(amended.nextRunAt).toBeNull();
  });

  it('refuses an end date before the order even started', async () => {
    const { service, lifecycle } = rig();
    const order = await service.create({ userId: CUSTOMER, request: orderRequest() });

    const code = await codeOf(
      lifecycle.amend({ userId: CUSTOMER, orderId: order.id, request: { endsOn: '2026-08-20' } }),
    );

    expect(code).toBe('VALIDATION_FAILED');
  });
});

describe('on the wire', () => {
  it('publishes the rule and the next date the client renders', async () => {
    const { service } = rig();
    const order = await service.create({
      userId: CUSTOMER,
      request: orderRequest({ reference: 'FLAT 4B', frequency: RecurrenceFrequency.MONTHLY }),
    });

    expect(toContractTransferOrder(order)).toEqual({
      id: order.id,
      name: 'Rent',
      status: TransferOrderStatus.ACTIVE,
      sourceAccountId: ACCOUNT,
      beneficiaryId: PAYEE,
      amount: { amount: '25000', currency: 'GBP' },
      reference: 'FLAT 4B',
      frequency: RecurrenceFrequency.MONTHLY,
      dayOfMonth: 31,
      dayOfWeek: null,
      startsOn: '2026-08-31',
      endsOn: null,
      maxOccurrences: null,
      occurrencesRun: 0,
      nextRunAt: '2026-08-31T00:00:00.000Z',
      lastRunAt: null,
      consecutiveFailures: 0,
      createdAt: `${TODAY}T09:00:00.000Z`,
    });
  });
});
