import { AuthorisationStatus } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { toStored } from '../../../common/money/money.codec.js';
import { gbp } from '../../accounts/__tests__/accounts-harness.js';
import { type AuthorisationRecord } from '../authorisation/authorisation.store.js';
import { type CardRecord } from '../card.store.js';
import { categoryFor, labelFor } from '../insights/mcc-catalogue.js';
import { detectSubscriptions } from '../insights/subscription-detection.js';

import { cardsRig, purchase, seedActiveCard, type CardsRig } from './cards-harness.js';

/** A month, in milliseconds, as the cadence detector measures one. */
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

describe('spend by merchant category', () => {
  let rig: CardsRig;
  let card: CardRecord;

  beforeEach(async () => {
    rig = cardsRig();
    card = await seedActiveCard(rig, { balance: gbp(2_000_00) });
  });

  it('groups spend under names a customer recognises', async () => {
    await rig.authorise.authorise(purchase(card.id, 40_00, { mcc: '5411' }));
    await rig.authorise.authorise(purchase(card.id, 60_00, { mcc: '5411' }));
    await rig.authorise.authorise(purchase(card.id, 25_00, { mcc: '5812' }));

    const insights = await rig.insights.forCard(card.userId, card.id);

    expect(insights.totalSpend.toJSON()).toEqual(gbp(125_00).toJSON());
    expect(insights.byCategory[0]).toMatchObject({
      mcc: '5411',
      label: 'Groceries',
      transactionCount: 2,
    });
    expect(insights.byCategory[0]?.total.toJSON()).toEqual(gbp(100_00).toJSON());
  });

  it('reports each category as a share in basis points', async () => {
    await rig.authorise.authorise(purchase(card.id, 75_00, { mcc: '5411' }));
    await rig.authorise.authorise(purchase(card.id, 25_00, { mcc: '5812' }));

    const insights = await rig.insights.forCard(card.userId, card.id);
    const groceries = insights.byCategory.find((row) => row.mcc === '5411');

    expect(groceries?.shareBps).toBe(7500);
  });

  it('counts a payment that is only held, not yet claimed', async () => {
    const held = await rig.authorise.authorise(purchase(card.id, 30_00, { mcc: '5411' }));
    expect(held.status).toBe(AuthorisationStatus.APPROVED);

    const insights = await rig.insights.forCard(card.userId, card.id);
    expect(insights.totalSpend.toJSON()).toEqual(gbp(30_00).toJSON());
  });

  it('counts what was actually taken once a payment is captured for less', async () => {
    const auth = await rig.authorise.authorise(purchase(card.id, 100_00, { mcc: '5541' }));
    await rig.capture.capture({
      authorisationId: auth.id,
      amount: gbp(38_50),
      clearingReference: 'CLR-FUEL',
    });

    const insights = await rig.insights.forCard(card.userId, card.id);
    expect(insights.totalSpend.toJSON()).toEqual(gbp(38_50).toJSON());
  });

  it('excludes declines from spend but reports why they happened', async () => {
    await rig.authorise.authorise(purchase(card.id, 20_00, { mcc: '7995' }));
    await rig.authorise.authorise(purchase(card.id, 20_00, { mcc: '7995' }));
    await rig.authorise.authorise(purchase(card.id, 50_00, { mcc: '5411' }));

    const insights = await rig.insights.forCard(card.userId, card.id);

    expect(insights.totalSpend.toJSON()).toEqual(gbp(50_00).toJSON());
    expect(insights.declines).toEqual([{ reason: 'MERCHANT_BLOCKED', count: 2 }]);
  });

  it('reports an unnamed category honestly rather than dropping it', async () => {
    await rig.authorise.authorise(purchase(card.id, 12_00, { mcc: '9999' }));

    const insights = await rig.insights.forCard(card.userId, card.id);

    expect(insights.byCategory[0]?.label).toBe('Other');
    expect(insights.totalSpend.toJSON()).toEqual(gbp(12_00).toJSON());
  });

  it('names the categories it knows', () => {
    expect(labelFor('5411')).toBe('Groceries');
    expect(labelFor('4111')).toBe('Public transport');
    expect(categoryFor('4899').commonlyRecurring).toBe(true);
    expect(categoryFor('5411').commonlyRecurring).toBe(false);
  });
});

describe('subscription detection', () => {
  const STREAMING = {
    merchantId: 'mrc_northlight_streaming',
    merchantName: 'Northlight Streaming',
    mcc: '4899',
  };

  it('spots a monthly charge after three occurrences', () => {
    const charges = monthlyCharges(STREAMING, gbp(10_99), 3);

    const [found] = detectSubscriptions(charges, 'GBP');

    expect(found?.merchantName).toBe('Northlight Streaming');
    expect(found?.cadence).toBe('MONTHLY');
    expect(found?.occurrences).toBe(3);
    expect(found?.amount.toJSON()).toEqual(gbp(10_99).toJSON());
    expect(found?.totalPaid.toJSON()).toEqual(gbp(32_97).toJSON());
  });

  it('predicts the next charge a month after the last', () => {
    const charges = monthlyCharges(STREAMING, gbp(10_99), 3);

    const [found] = detectSubscriptions(charges, 'GBP');
    const last = charges.at(-1);

    expect(found?.nextExpectedAt.getTime()).toBe((last?.authorisedAt.getTime() ?? 0) + THIRTY_DAYS);
  });

  it('holds back on two charges — a coincidence is not a subscription', () => {
    const charges = monthlyCharges(STREAMING, gbp(10_99), 2);

    expect(detectSubscriptions(charges, 'GBP')).toEqual([]);
  });

  it('tolerates a price rise within ten per cent', () => {
    const charges = monthlyCharges(STREAMING, gbp(10_00), 3);
    const risen = charges.map((charge, index) =>
      index === 2 ? withAmount(charge, gbp(10_90)) : charge,
    );

    const [found] = detectSubscriptions(risen, 'GBP');

    expect(found?.amount.toJSON()).toEqual(gbp(10_90).toJSON());
  });

  it('rejects wildly varying amounts from one merchant', () => {
    const charges = monthlyCharges(STREAMING, gbp(10_00), 3);
    const erratic = charges.map((charge, index) =>
      index === 1 ? withAmount(charge, gbp(80_00)) : charge,
    );

    expect(detectSubscriptions(erratic, 'GBP')).toEqual([]);
  });

  it('rejects charges that do not fall on a steady cadence', () => {
    const charges = monthlyCharges(STREAMING, gbp(10_00), 3);
    const irregular = charges.map((charge, index) =>
      index === 2
        ? { ...charge, authorisedAt: new Date(charge.authorisedAt.getTime() + 11 * 24 * 3600_000) }
        : charge,
    );

    expect(detectSubscriptions(irregular, 'GBP')).toEqual([]);
  });

  it('spots a weekly cadence as well as a monthly one', () => {
    const gym = { merchantId: 'mrc_riverside_gym', merchantName: 'Riverside Gym', mcc: '7997' };
    const charges = chargesEvery(gym, gbp(12_00), 4, SEVEN_DAYS);

    const [found] = detectSubscriptions(charges, 'GBP');

    expect(found?.cadence).toBe('WEEKLY');
  });

  it('ignores a merchant whose payments were all declined', () => {
    const charges = monthlyCharges(STREAMING, gbp(10_99), 3).map((charge) => ({
      ...charge,
      status: AuthorisationStatus.DECLINED,
      declineReason: 'INSUFFICIENT_FUNDS' as const,
    }));

    expect(detectSubscriptions(charges, 'GBP')).toEqual([]);
  });

  it('does not read a weekly grocery shop as a subscription', () => {
    const shop = { merchantId: 'mrc_corner_market', merchantName: 'Corner Market', mcc: '5411' };
    // Real grocery baskets vary; a subscription does not.
    const charges = chargesEvery(shop, gbp(43_10), 4, SEVEN_DAYS).map((charge, index) =>
      withAmount(charge, gbp(43_10 + index * 9_00)),
    );

    expect(detectSubscriptions(charges, 'GBP')).toEqual([]);
  });

  it('finds a subscription through the service, on a real card', async () => {
    const rig = cardsRig();
    const card = await seedActiveCard(rig, { balance: gbp(2_000_00) });

    for (let month = 0; month < 3; month += 1) {
      await rig.authorise.authorise(
        purchase(card.id, 10_99, { ...STREAMING, channel: 'RECURRING' }),
      );
      rig.clock.advance(THIRTY_DAYS);
    }

    const found = await rig.insights.subscriptionsFor(card.userId, card.id);

    expect(found).toHaveLength(1);
    expect(found[0]?.merchantName).toBe('Northlight Streaming');
  });
});

/**
 * Restates a charge at a different amount.
 *
 * Both fields have to move together. The detector reads `capturedAmount` in preference to
 * `amount` — what the merchant actually took beats what they asked for — so a fixture
 * that changed only one of them would leave the amount the detector actually sees
 * untouched, and a variance test would pass while proving nothing.
 */
function withAmount(charge: AuthorisationRecord, amount: Money): AuthorisationRecord {
  return { ...charge, amount: toStored(amount), capturedAmount: toStored(amount) };
}

/** `count` charges from one merchant, one month apart, all for the same amount. */
function monthlyCharges(
  merchant: { merchantId: string; merchantName: string; mcc: string },
  amount: Money,
  count: number,
): AuthorisationRecord[] {
  return chargesEvery(merchant, amount, count, THIRTY_DAYS);
}

function chargesEvery(
  merchant: { merchantId: string; merchantName: string; mcc: string },
  amount: Money,
  count: number,
  intervalMs: number,
): AuthorisationRecord[] {
  const start = new Date('2026-01-05T09:00:00.000Z').getTime();

  return Array.from({ length: count }, (_unused, index) => ({
    id: `aut_fixture_${index}`,
    cardId: 'crd_fixture',
    accountId: 'acc_fixture',
    userId: 'usr_fixture',
    status: AuthorisationStatus.CAPTURED,
    amount: toStored(amount),
    requestedAmount: toStored(amount),
    originalAmount: null,
    merchantId: merchant.merchantId,
    merchantName: merchant.merchantName,
    merchantCountry: 'GB',
    mcc: merchant.mcc,
    channel: 'RECURRING' as const,
    declineReason: null,
    responseCode: '00',
    holdId: null,
    journalEntryId: null,
    transactionId: null,
    threeDsChallenged: false,
    threeDsOutcome: null,
    networkReference: `ARN${index}`,
    clearingReference: null,
    settlementBatchId: null,
    capturedAmount: toStored(amount),
    refundedAmount: null,
    incrementCount: 0,
    authorisedAt: new Date(start + index * intervalMs),
    capturedAt: new Date(start + index * intervalMs),
    clearedAt: new Date(start + index * intervalMs),
    settledAt: null,
    reversedAt: null,
    expiresAt: new Date(start + index * intervalMs + intervalMs),
  }));
}
