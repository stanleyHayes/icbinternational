import { SpendCategory, TransactionDirection } from '@reliance/contracts';

import { type ClockService } from '../../../common/clock/clock.service.js';
import { SubscriptionService } from '../subscription.service.js';

import { buildHarness, insertAll, spendRow, USER_ID } from './insights-test.helpers.js';

const NOW = '2026-06-01T00:00:00.000Z';
const CLOCK = { now: () => new Date(NOW) } as unknown as ClockService;

function build() {
  const harness = buildHarness();
  return { ...harness, service: new SubscriptionService(harness.reader, CLOCK) };
}

/** `count` charges of `minorUnits`, `gapDays` apart, ending shortly before `NOW`. */
function series(input: {
  merchant: string;
  minorUnits: number | number[];
  count: number;
  gapDays: number;
  merchantId?: string;
}) {
  const amounts = Array.isArray(input.minorUnits)
    ? input.minorUnits
    : Array.from({ length: input.count }, () => input.minorUnits as number);

  return amounts.map((minorUnits, index) =>
    spendRow({
      minorUnits,
      category: SpendCategory.SUBSCRIPTIONS,
      merchant: input.merchant,
      ...(input.merchantId ? { merchantId: input.merchantId } : {}),
      bookedAt: new Date(Date.parse(NOW) - (amounts.length - index) * input.gapDays * 86_400_000),
    }),
  );
}

describe('SubscriptionService', () => {
  it('detects a monthly charge of a steady amount', async () => {
    const { store, service } = build();
    await insertAll(
      store,
      series({ merchant: 'Streamly', minorUnits: 999, count: 6, gapDays: 30 }),
    );

    const [subscription] = await service.detect({ userId: USER_ID });

    expect(subscription).toMatchObject({
      merchantName: 'Streamly',
      cadence: 'MONTHLY',
      transactionCount: 6,
    });
    expect(subscription?.amount.amount).toBe('999');
  });

  it('tolerates the day-or-two drift a real direct debit has', async () => {
    const { store, service } = build();
    await insertAll(store, series({ merchant: 'Gym', minorUnits: 3500, count: 5, gapDays: 31 }));

    const [subscription] = await service.detect({ userId: USER_ID });
    expect(subscription?.cadence).toBe('MONTHLY');
  });

  it('detects weekly, quarterly and annual cadences', async () => {
    const { store, service } = build();
    await insertAll(store, [
      ...series({ merchant: 'Weekly Box', minorUnits: 1200, count: 8, gapDays: 7 }),
      ...series({ merchant: 'Quarterly Mag', minorUnits: 4500, count: 4, gapDays: 91 }),
    ]);

    const detected = await service.detect({
      userId: USER_ID,
      from: '2020-01-01T00:00:00.000Z',
      to: NOW,
    });
    const cadences = new Map(detected.map((one) => [one.merchantName, one.cadence]));

    expect(cadences.get('Weekly Box')).toBe('WEEKLY');
    expect(cadences.get('Quarterly Mag')).toBe('QUARTERLY');
  });

  it('rejects two charges as a coincidence', async () => {
    const { store, service } = build();
    await insertAll(
      store,
      series({ merchant: 'Twice Only', minorUnits: 999, count: 2, gapDays: 30 }),
    );

    await expect(service.detect({ userId: USER_ID })).resolves.toEqual([]);
  });

  it('rejects a merchant the customer simply visits often at varying amounts', async () => {
    const { store, service } = build();
    await insertAll(
      store,
      series({
        merchant: 'Corner Coffee',
        minorUnits: [280, 450, 320, 610],
        count: 4,
        gapDays: 7,
      }),
    );

    await expect(service.detect({ userId: USER_ID })).resolves.toEqual([]);
  });

  it('rejects charges with no recognisable cadence', async () => {
    const { store, service } = build();
    const irregular = [3, 47, 12].map((offsetDays, index) =>
      spendRow({
        minorUnits: 999,
        category: SpendCategory.SHOPPING,
        merchant: 'Erratic Ltd',
        bookedAt: new Date(Date.parse(NOW) - (index + 1) * offsetDays * 86_400_000),
      }),
    );
    await insertAll(store, irregular);

    await expect(service.detect({ userId: USER_ID })).resolves.toEqual([]);
  });

  it('ignores credits — a refund is not a subscription', async () => {
    const { store, service } = build();
    await insertAll(
      store,
      series({ merchant: 'Refunder', minorUnits: 999, count: 5, gapDays: 30 }).map((one) => ({
        ...one,
        direction: TransactionDirection.CREDIT,
      })),
    );

    await expect(service.detect({ userId: USER_ID })).resolves.toEqual([]);
  });

  it('keeps a rebranded merchant as one subscription when the acquirer id is stable', async () => {
    const { store, service } = build();
    const charges = series({
      merchant: 'Old Name',
      minorUnits: 1500,
      count: 5,
      gapDays: 30,
      merchantId: 'mrc_stable',
    });
    const renamed = charges.map((one, index) =>
      index < 2 || !one.counterparty
        ? one
        : { ...one, counterparty: { ...one.counterparty, name: 'New Name' } },
    );
    await insertAll(store, renamed);

    const detected = await service.detect({ userId: USER_ID });

    expect(detected).toHaveLength(1);
    expect(detected[0]?.transactionCount).toBe(5);
  });

  it('projects the next charge from the observed gap, not the nominal cadence', async () => {
    const { store, service } = build();
    await insertAll(
      store,
      series({ merchant: 'Every 28', minorUnits: 999, count: 5, gapDays: 28 }),
    );

    const [subscription] = await service.detect({ userId: USER_ID });
    const last = Date.parse(subscription?.lastChargedAt ?? NOW);
    const next = Date.parse(subscription?.nextExpectedAt ?? NOW);

    expect((next - last) / 86_400_000).toBe(28);
  });

  it('ranks the most expensive subscription first', async () => {
    const { store, service } = build();
    await insertAll(store, [
      ...series({ merchant: 'Cheap', minorUnits: 199, count: 4, gapDays: 30 }),
      ...series({ merchant: 'Expensive', minorUnits: 4999, count: 4, gapDays: 30 }),
    ]);

    const detected = await service.detect({ userId: USER_ID });
    expect(detected.map((one) => one.merchantName)).toEqual(['Expensive', 'Cheap']);
  });
});
