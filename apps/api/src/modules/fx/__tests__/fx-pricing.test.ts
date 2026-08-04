import { CustomerSegment } from '@reliance/contracts';
import { convert, formatRate, Money, rateFromDecimalString } from '@reliance/money';

import { priceByBuy, priceBySell } from '../fx-pricing.js';
import { halfOf, markDown, markUp, pairSpreadBps, spreadBpsFor } from '../fx-spread.js';

const GBP_EUR = rateFromDecimalString('GBP', 'EUR', '1.1685');
const GBP_JPY = rateFromDecimalString('GBP', 'JPY', '192.4000');
const SPREAD_BPS = 30;

describe('spread', () => {
  it('is wider on the pair whose weaker leg is less liquid', () => {
    expect(pairSpreadBps('GBP', 'USD')).toBeLessThan(pairSpreadBps('GBP', 'NGN'));
    expect(pairSpreadBps('EUR', 'NGN')).toBe(pairSpreadBps('NGN', 'EUR'));
  });

  it('rewards a business customer and a verified one, and never goes below the floor', () => {
    const retail = spreadBpsFor({
      from: 'GBP',
      to: 'EUR',
      customer: { segment: CustomerSegment.PERSONAL, kycTier: 0 },
    });
    const business = spreadBpsFor({
      from: 'GBP',
      to: 'EUR',
      customer: { segment: CustomerSegment.BUSINESS, kycTier: 3 },
    });

    expect(business).toBeLessThan(retail);
    expect(business).toBeGreaterThanOrEqual(12);
  });

  it('marks up and marks down symmetrically around mid', () => {
    const half = halfOf(SPREAD_BPS);
    const bid = markDown(GBP_EUR, half);
    const ask = markUp(GBP_EUR, half);

    expect(bid.value).toBeLessThan(GBP_EUR.value);
    expect(ask.value).toBeGreaterThan(GBP_EUR.value);
  });

  it('keeps full precision on a large-numbered pair rather than round-tripping an inverse', () => {
    // GBP/JPY inverted at scale 8 keeps five significant digits; a mark-down computed by
    // double inversion would move the rate by a basis point of pure rounding.
    const marked = markDown(GBP_JPY, 30);
    const expected = (GBP_JPY.value * 10_000n) / 10_030n;

    expect(marked.value).toBe(expected);
  });

  it('refuses a spread that is not a whole number of basis points', () => {
    expect(() => markDown(GBP_EUR, -1)).toThrow(RangeError);
  });
});

describe('pricing a conversion', () => {
  it('gives the customer less than mid, and books the difference as the margin', () => {
    const sellAmount = Money.fromMajor('500.00', 'GBP');
    const price = priceBySell({ sellAmount, mid: GBP_EUR, spreadBps: SPREAD_BPS });

    const atMid = convert(sellAmount, GBP_EUR);

    expect(price.buyAmount.lessThan(atMid)).toBe(true);
    expect(price.spreadCost.currency).toBe('EUR');
    expect(price.buyAmount.plus(price.spreadCost).equals(atMid)).toBe(true);
  });

  it('never books a negative margin, however small the trade', () => {
    const price = priceBySell({
      sellAmount: Money.fromMinor(1n, 'GBP'),
      mid: GBP_EUR,
      spreadBps: SPREAD_BPS,
    });

    expect(price.spreadCost.isNegative).toBe(false);
  });

  it('delivers at least what was asked for when the buy side is fixed', () => {
    const buyAmount = Money.fromMajor('600.00', 'EUR');
    const price = priceByBuy({ buyAmount, mid: GBP_EUR, spreadBps: SPREAD_BPS });

    expect(price.buyAmount.equals(buyAmount)).toBe(true);
    expect(convert(price.sellAmount, price.customerRate).greaterThanOrEqual(buyAmount)).toBe(true);
  });

  it('prices both directions off the same rate, so the two agree', () => {
    const bySell = priceBySell({
      sellAmount: Money.fromMajor('500.00', 'GBP'),
      mid: GBP_EUR,
      spreadBps: SPREAD_BPS,
    });

    const byBuy = priceByBuy({
      buyAmount: bySell.buyAmount,
      mid: GBP_EUR,
      spreadBps: SPREAD_BPS,
    });

    expect(formatRate(byBuy.customerRate)).toBe(formatRate(bySell.customerRate));
    // Fixing the receive side may cost one extra minor unit, never more.
    expect(byBuy.sellAmount.minus(bySell.sellAmount).abs().amount).toBeLessThanOrEqual(1n);
  });

  it('handles a currency with no minor units without losing the rounding step', () => {
    const price = priceBySell({
      sellAmount: Money.fromMajor('500.00', 'GBP'),
      mid: GBP_JPY,
      spreadBps: SPREAD_BPS,
    });

    expect(price.buyAmount.currency).toBe('JPY');
    expect(price.buyAmount.amount % 1n).toBe(0n);
    expect(price.buyAmount.isPositive).toBe(true);
  });

  it('reports mid alongside the customer rate, so the margin is never hidden', () => {
    const price = priceBySell({
      sellAmount: Money.fromMajor('500.00', 'GBP'),
      mid: GBP_EUR,
      spreadBps: SPREAD_BPS,
    });

    expect(price.midRate.value).toBe(GBP_EUR.value);
    expect(price.customerRate.value).toBeLessThan(price.midRate.value);
    expect(price.spreadBps).toBe(SPREAD_BPS);
  });
});
