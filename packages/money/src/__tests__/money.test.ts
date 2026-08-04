import { CurrencyMismatchError, InvalidAmountError } from '../money.errors.js';
import { Money, sumMoney } from '../money.js';
import { RoundingMode } from '../rounding.js';

describe('Money construction', () => {
  it('builds from minor units', () => {
    expect(Money.fromMinor(123456n, 'USD').amount).toBe(123456n);
    expect(Money.fromMinor(123456, 'USD').amount).toBe(123456n);
    expect(Money.fromMinor('123456', 'USD').amount).toBe(123456n);
    expect(Money.fromMinor(' -42 ', 'USD').amount).toBe(-42n);
  });

  it('builds from a major-unit string', () => {
    expect(Money.fromMajor('1,234.56', 'USD').amount).toBe(123456n);
    expect(Money.fromMajor('1234', 'JPY').amount).toBe(1234n);
    expect(Money.fromMajor('1.234', 'KWD').amount).toBe(1234n);
  });

  it('rejects unsafe integers as minor units', () => {
    expect(() => Money.fromMinor(Number.MAX_SAFE_INTEGER + 2, 'USD')).toThrow(InvalidAmountError);
  });

  it('rejects a non-integer minor-unit string', () => {
    expect(() => Money.fromMinor('12.34', 'USD')).toThrow(/integer string of minor units/);
  });

  it('rejects an unsupported currency', () => {
    expect(() => Money.fromMinor(1n, 'XYZ' as never)).toThrow(/unsupported currency/);
    expect(() => Money.zero('XYZ' as never)).toThrow(InvalidAmountError);
  });

  it('is immutable', () => {
    const money = Money.fromMinor(100n, 'USD');
    expect(Object.isFrozen(money)).toBe(true);
  });

  it('round-trips through JSON', () => {
    const original = Money.fromMajor('-9,876.54', 'EUR');
    const restored = Money.fromJSON(JSON.parse(JSON.stringify(original)) as never);
    expect(restored.equals(original)).toBe(true);
    expect(original.toJSON()).toEqual({ amount: '-987654', currency: 'EUR' });
  });
});

describe('Money arithmetic', () => {
  const tenUsd = Money.fromMajor('10.00', 'USD');
  const threeUsd = Money.fromMajor('3.00', 'USD');

  it('adds and subtracts', () => {
    expect(tenUsd.plus(threeUsd).toMajorString()).toBe('13.00');
    expect(tenUsd.minus(threeUsd).toMajorString()).toBe('7.00');
  });

  it('refuses to mix currencies', () => {
    const tenEur = Money.fromMajor('10.00', 'EUR');
    expect(() => tenUsd.plus(tenEur)).toThrow(CurrencyMismatchError);
    expect(() => tenUsd.minus(tenEur)).toThrow(/Cannot combine USD and EUR/);
    expect(() => tenUsd.compare(tenEur)).toThrow(CurrencyMismatchError);
  });

  it('multiplies by an integer factor', () => {
    expect(tenUsd.times(3).toMajorString()).toBe('30.00');
    expect(tenUsd.times(-2n).toMajorString()).toBe('-20.00');
  });

  it('applies a percentage as an exact ratio', () => {
    // 7.5% of 120.00 = 9.00
    const fee = Money.fromMajor('120.00', 'GBP').scaleByRatio(75n, 1000n);
    expect(fee.toMajorString()).toBe('9.00');
  });

  it('rounds a ratio exactly once, using the mode given', () => {
    const base = Money.fromMinor(101n, 'USD');
    expect(base.scaleByRatio(1n, 2n, RoundingMode.HALF_EVEN).amount).toBe(50n);
    expect(base.scaleByRatio(1n, 2n, RoundingMode.HALF_UP).amount).toBe(51n);
    expect(base.scaleByRatio(1n, 2n, RoundingMode.DOWN).amount).toBe(50n);
  });

  it('does not accumulate float error over repeated addition', () => {
    const tenCents = Money.fromMajor('0.10', 'USD');
    const total = Array.from({ length: 10 }).reduce<Money>(
      (sum) => sum.plus(tenCents),
      Money.zero('USD'),
    );
    expect(total.toMajorString()).toBe('1.00');
  });

  it('negates and absolutises', () => {
    expect(tenUsd.negate().amount).toBe(-1000n);
    expect(tenUsd.negate().abs().amount).toBe(1000n);
    expect(tenUsd.abs()).toBe(tenUsd);
  });

  it('allocates and splits without losing a unit', () => {
    const [rent, food, savings] = Money.fromMajor('1,000.00', 'GBP').allocate([50, 30, 20]);
    expect([rent?.toMajorString(), food?.toMajorString(), savings?.toMajorString()]).toEqual([
      '500.00',
      '300.00',
      '200.00',
    ]);

    const thirds = Money.fromMajor('10.00', 'USD').split(3);
    expect(thirds.map((part) => part.amount)).toEqual([334n, 333n, 333n]);
    expect(sumMoney(thirds, 'USD').toMajorString()).toBe('10.00');
  });
});

describe('Money comparison', () => {
  const five = Money.fromMajor('5.00', 'USD');
  const ten = Money.fromMajor('10.00', 'USD');

  it('orders amounts', () => {
    expect(five.compare(ten)).toBe(-1);
    expect(ten.compare(five)).toBe(1);
    expect(ten.compare(Money.fromMajor('10.00', 'USD'))).toBe(0);
  });

  it('exposes readable predicates', () => {
    expect(ten.greaterThan(five)).toBe(true);
    expect(ten.greaterThanOrEqual(ten)).toBe(true);
    expect(five.lessThan(ten)).toBe(true);
    expect(five.lessThanOrEqual(five)).toBe(true);
    expect(five.equals(Money.fromMajor('5.00', 'USD'))).toBe(true);
    expect(five.equals(Money.fromMajor('5.00', 'EUR'))).toBe(false);
  });

  it('reports sign', () => {
    expect(Money.zero('USD').isZero).toBe(true);
    expect(ten.isPositive).toBe(true);
    expect(ten.negate().isNegative).toBe(true);
  });
});

describe('Money representation', () => {
  it('exposes the currency exponent', () => {
    expect(Money.zero('JPY').exponent).toBe(0);
    expect(Money.zero('USD').exponent).toBe(2);
    expect(Money.zero('KWD').exponent).toBe(3);
  });

  it('formats for display and for machines', () => {
    const amount = Money.fromMajor('1,234.56', 'USD');
    expect(amount.toMajorString()).toBe('1234.56');
    expect(amount.format()).toBe('$1,234.56');
    expect(amount.toString()).toBe('1234.56 USD');
  });
});

describe('sumMoney', () => {
  it('sums a list', () => {
    const amounts = ['1.00', '2.50', '3.25'].map((value) => Money.fromMajor(value, 'USD'));
    expect(sumMoney(amounts, 'USD').toMajorString()).toBe('6.75');
  });

  it('returns zero for an empty list', () => {
    expect(sumMoney([], 'GBP').isZero).toBe(true);
  });
});
