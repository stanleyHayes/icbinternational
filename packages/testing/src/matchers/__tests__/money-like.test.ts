import { Money } from '@reliance/money';

import { aMoney } from '../../builders/money.builder.js';
import { describeMoney, isMoneyLike, normaliseMoney } from '../money-like.js';

describe('money-like narrowing', () => {
  it('accepts the Money value object', () => {
    expect(isMoneyLike(Money.fromMinor(100n, 'GBP'))).toBe(true);
  });

  it('accepts the wire shape', () => {
    expect(isMoneyLike({ amount: '100', currency: 'GBP' })).toBe(true);
  });

  it('rejects non-money values', () => {
    expect(isMoneyLike(null)).toBe(false);
    expect(isMoneyLike('100 GBP')).toBe(false);
    expect(isMoneyLike({ amount: '100' })).toBe(false);
    expect(isMoneyLike({ amount: {}, currency: 'GBP' })).toBe(false);
  });

  it('normalises bigint, integer and string amounts to bigint', () => {
    expect(normaliseMoney({ amount: 100n, currency: 'GBP' })).toEqual({
      amount: 100n,
      currency: 'GBP',
    });
    expect(normaliseMoney({ amount: 100, currency: 'GBP' })).toEqual({
      amount: 100n,
      currency: 'GBP',
    });
    expect(normaliseMoney({ amount: '100', currency: 'GBP' })).toEqual({
      amount: 100n,
      currency: 'GBP',
    });
  });

  it('returns null for unusable input instead of throwing', () => {
    expect(normaliseMoney({ amount: 'not-a-number', currency: 'GBP' })).toBeNull();
    expect(normaliseMoney({ amount: 1.5, currency: 'GBP' })).toBeNull();
    expect(normaliseMoney({ amount: 100n, currency: 'XXX' })).toBeNull();
    expect(normaliseMoney(undefined)).toBeNull();
  });

  it('describes money for matcher messages', () => {
    expect(describeMoney({ amount: 1250n, currency: 'GBP' })).toBe('1250 minor GBP');
    expect(describeMoney('nope')).toBe('not money-shaped (string)');
  });
});

describe('toEqualMoney matcher', () => {
  it('passes across shapes: Money vs wire JSON', () => {
    expect(Money.fromMajor('12.50', 'GBP')).toEqualMoney({ amount: '1250', currency: 'GBP' });
  });

  it('passes for builder output against a Money', () => {
    expect(aMoney().withMinor(500n).buildJSON()).toEqualMoney(Money.fromMinor(500n, 'GBP'));
  });

  it('fails on different amounts', () => {
    expect(Money.fromMinor(100n, 'GBP')).not.toEqualMoney({ amount: '101', currency: 'GBP' });
  });

  it('fails on different currencies with the same amount', () => {
    expect(Money.fromMinor(100n, 'GBP')).not.toEqualMoney({ amount: '100', currency: 'USD' });
  });

  it('fails cleanly on non-money input', () => {
    expect('£1.00').not.toEqualMoney({ amount: '100', currency: 'GBP' });
  });
});
