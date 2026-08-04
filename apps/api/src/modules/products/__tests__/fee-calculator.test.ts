import { FeeKind, type FeeScheduleEntry } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { AppError } from '../../../common/errors/app-error.js';
import { EVERYDAY_CURRENT } from '../../../seed/foundation/catalogue/everyday-current.product.js';
import { computeFee, FeeWaiver, findFeeEntry, unpricedQuote } from '../fee-calculator.js';

const gbp = (major: string) => Money.fromMajor(major, 'GBP');
const eur = (major: string) => Money.fromMajor(major, 'EUR');

function entry(overrides: Partial<FeeScheduleEntry> = {}): FeeScheduleEntry {
  return {
    kind: FeeKind.ATM_INTERNATIONAL,
    label: 'Cash withdrawal abroad',
    flatAmount: null,
    rateBps: null,
    minAmount: null,
    maxAmount: null,
    freeAllowancePerMonth: 0,
    waivedForTiers: [],
    ...overrides,
  };
}

function priceOf(overrides: Partial<FeeScheduleEntry>, amount: Money, usedThisMonth = 0) {
  return computeFee({ entry: entry(overrides), amount, usedThisMonth, tier: null });
}

describe('computeFee', () => {
  it('charges a flat fee regardless of the amount', () => {
    const quote = priceOf({ flatAmount: gbp('2.50').toJSON() }, gbp('400.00'));

    expect(quote.fee.toMajorString()).toBe('2.50');
    expect(quote.waivedBy).toBeNull();
  });

  it('applies a basis-point rate exactly, without a float in sight', () => {
    // 2.75% of £1,234.56 is £33.9504, which must round to £33.95 and not £33.96.
    const quote = priceOf({ rateBps: 275 }, gbp('1234.56'));

    expect(quote.fee.toMajorString()).toBe('33.95');
  });

  it('sums the flat and proportional components before clamping', () => {
    const quote = priceOf({ flatAmount: gbp('1.50').toJSON(), rateBps: 200 }, gbp('100.00'));

    expect(quote.fee.toMajorString()).toBe('3.50');
  });

  it('raises a fee below the floor up to it', () => {
    const quote = priceOf({ rateBps: 25, minAmount: gbp('12.00').toJSON() }, gbp('100.00'));

    expect(quote.fee.toMajorString()).toBe('12.00');
  });

  it('caps a fee that would otherwise run away on a large transfer', () => {
    const quote = priceOf(
      { rateBps: 25, minAmount: gbp('12.00').toJSON(), maxAmount: gbp('40.00').toJSON() },
      gbp('1000000.00'),
    );

    expect(quote.fee.toMajorString()).toBe('40.00');
  });

  it('prices a negative amount on its magnitude, not its sign', () => {
    const quote = priceOf({ rateBps: 200 }, gbp('-500.00'));

    expect(quote.fee.toMajorString()).toBe('10.00');
  });

  it('refuses a catalogue whose cap sits below its floor', () => {
    expect(() =>
      priceOf(
        {
          flatAmount: gbp('1.00').toJSON(),
          minAmount: gbp('20.00').toJSON(),
          maxAmount: gbp('5.00').toJSON(),
        },
        gbp('100.00'),
      ),
    ).toThrow(AppError);
  });

  it('refuses to charge a sterling fee against a euro transaction', () => {
    expect(() => priceOf({ flatAmount: gbp('1.50').toJSON() }, eur('100.00'))).toThrow(AppError);
  });
});

describe('free allowances', () => {
  it('waives the fee while the customer is inside the allowance', () => {
    const quote = priceOf(
      { flatAmount: gbp('1.50').toJSON(), freeAllowancePerMonth: 3 },
      gbp('50.00'),
      1,
    );

    expect(quote.fee.isZero).toBe(true);
    expect(quote.waivedBy).toBe(FeeWaiver.FREE_ALLOWANCE);
    expect(quote.freeRemaining).toBe(1);
  });

  it('charges once the allowance is spent', () => {
    const quote = priceOf(
      { flatAmount: gbp('1.50').toJSON(), freeAllowancePerMonth: 3 },
      gbp('50.00'),
      3,
    );

    expect(quote.fee.toMajorString()).toBe('1.50');
    expect(quote.waivedBy).toBeNull();
    expect(quote.freeRemaining).toBe(0);
  });

  it('never reports a negative remaining allowance', () => {
    const quote = priceOf(
      { flatAmount: gbp('1.50').toJSON(), freeAllowancePerMonth: 2 },
      gbp('50.00'),
      9,
    );

    expect(quote.freeRemaining).toBe(0);
  });
});

describe('tier waivers', () => {
  const premier = entry({
    flatAmount: gbp('1.50').toJSON(),
    freeAllowancePerMonth: 2,
    waivedForTiers: ['PREMIER'],
  });

  it('waives for a tier on the list', () => {
    const quote = computeFee({
      entry: premier,
      amount: gbp('50.00'),
      usedThisMonth: 0,
      tier: 'PREMIER',
    });

    expect(quote.waivedBy).toBe(FeeWaiver.TIER);
  });

  it('does not consume the free allowance when the tier waives the fee', () => {
    const quote = computeFee({
      entry: premier,
      amount: gbp('50.00'),
      usedThisMonth: 0,
      tier: 'PREMIER',
    });

    expect(quote.freeRemaining).toBe(2);
  });

  it('charges a tier that is not on the list once the allowance is gone', () => {
    const quote = computeFee({
      entry: premier,
      amount: gbp('50.00'),
      usedThisMonth: 5,
      tier: 'STUDENT',
    });

    expect(quote.fee.toMajorString()).toBe('1.50');
  });
});

describe('findFeeEntry', () => {
  it('finds a kind the product prices', () => {
    expect(findFeeEntry(EVERYDAY_CURRENT, FeeKind.ATM_INTERNATIONAL)?.rateBps).toBe(200);
  });

  it('returns null for a kind the product does not price', () => {
    expect(findFeeEntry(EVERYDAY_CURRENT, FeeKind.LATE_PAYMENT)).toBeNull();
  });
});

describe('unpricedQuote', () => {
  it('is free, and says why', () => {
    const quote = unpricedQuote(FeeKind.LATE_PAYMENT, 'GBP');

    expect(quote.fee.isZero).toBe(true);
    expect(quote.waivedBy).toBe(FeeWaiver.NOT_PRICED);
  });
});

describe('the seeded Everyday Current schedule', () => {
  it('charges the £1.50 floor on a small withdrawal abroad', () => {
    const atm = findFeeEntry(EVERYDAY_CURRENT, FeeKind.ATM_INTERNATIONAL);

    const quote = computeFee({ entry: atm!, amount: gbp('20.00'), usedThisMonth: 2, tier: null });

    expect(quote.fee.toMajorString()).toBe('1.90');
  });

  it('caps the international transfer fee at £40', () => {
    const transfer = findFeeEntry(EVERYDAY_CURRENT, FeeKind.INTERNATIONAL_TRANSFER);

    const quote = computeFee({
      entry: transfer!,
      amount: gbp('500000.00'),
      usedThisMonth: 0,
      tier: null,
    });

    expect(quote.fee.toMajorString()).toBe('40.00');
  });
});
