import {
  applySpread,
  convert,
  formatRate,
  invertRate,
  rateFromDecimalString,
  RATE_SCALE,
} from '../exchange.js';
import { InvalidAmountError } from '../money.errors.js';
import { Money } from '../money.js';
import { RoundingMode } from '../rounding.js';

describe('rateFromDecimalString', () => {
  it('scales a decimal rate to an integer', () => {
    const rate = rateFromDecimalString('EUR', 'USD', '1.0845');
    expect(rate).toEqual({ from: 'EUR', to: 'USD', value: 108_450_000n, scale: RATE_SCALE });
  });

  it('accepts a whole-number rate', () => {
    expect(rateFromDecimalString('USD', 'USD', '1').value).toBe(100_000_000n);
  });

  it('truncates beyond the supported scale rather than failing', () => {
    expect(rateFromDecimalString('EUR', 'USD', '1.0845123456789').value).toBe(108_451_234n);
  });

  it.each([['-1.5'], ['0'], ['0.00000000'], ['abc'], ['']])('rejects %p', (input) => {
    expect(() => rateFromDecimalString('EUR', 'USD', input)).toThrow(InvalidAmountError);
  });
});

describe('convert', () => {
  const eurUsd = rateFromDecimalString('EUR', 'USD', '1.0845');

  it('converts between two-decimal currencies', () => {
    // €100.00 × 1.0845 = $108.45
    expect(convert(Money.fromMajor('100.00', 'EUR'), eurUsd).toMajorString()).toBe('108.45');
  });

  it('rescales when the target has fewer decimal places', () => {
    const usdJpy = rateFromDecimalString('USD', 'JPY', '151.32');
    // $10.00 × 151.32 = ¥1513
    expect(convert(Money.fromMajor('10.00', 'USD'), usdJpy).toMajorString()).toBe('1513');
  });

  it('rescales when the target has more decimal places', () => {
    const usdKwd = rateFromDecimalString('USD', 'KWD', '0.3067');
    // $100.00 × 0.3067 = KD 30.670
    expect(convert(Money.fromMajor('100.00', 'USD'), usdKwd).toMajorString()).toBe('30.670');
  });

  it('honours the rounding mode', () => {
    const rate = rateFromDecimalString('EUR', 'USD', '1.005');
    const amount = Money.fromMinor(1n, 'EUR');
    expect(convert(amount, rate, RoundingMode.DOWN).amount).toBe(1n);
    expect(convert(amount, rate, RoundingMode.UP).amount).toBe(2n);
  });

  it('preserves sign', () => {
    expect(convert(Money.fromMajor('-100.00', 'EUR'), eurUsd).toMajorString()).toBe('-108.45');
  });

  it('refuses a rate that does not apply to the amount', () => {
    expect(() => convert(Money.fromMajor('100.00', 'GBP'), eurUsd)).toThrow(
      /cannot be applied to GBP/,
    );
  });
});

describe('invertRate', () => {
  it('produces the reciprocal', () => {
    const eurUsd = rateFromDecimalString('EUR', 'USD', '1.25');
    const usdEur = invertRate(eurUsd);

    expect(usdEur.from).toBe('USD');
    expect(usdEur.to).toBe('EUR');
    expect(formatRate(usdEur)).toBe('0.80000000');
  });

  it('round-trips an amount to within one minor unit', () => {
    const rate = rateFromDecimalString('EUR', 'USD', '1.0845');
    const original = Money.fromMajor('250.00', 'EUR');
    const there = convert(original, rate);
    const back = convert(there, invertRate(rate));

    expect(Number(back.minus(original).abs().amount)).toBeLessThanOrEqual(1);
  });
});

describe('applySpread', () => {
  it('marks a rate up by basis points', () => {
    const mid = rateFromDecimalString('EUR', 'USD', '1.0000');
    expect(formatRate(applySpread(mid, 25))).toBe('1.00250000');
  });

  it('leaves a zero spread untouched', () => {
    const mid = rateFromDecimalString('EUR', 'USD', '1.0845');
    expect(applySpread(mid, 0).value).toBe(mid.value);
  });

  it.each([[-1], [1.5]])('rejects the invalid spread %p', (bps) => {
    const mid = rateFromDecimalString('EUR', 'USD', '1.0845');
    expect(() => applySpread(mid, bps)).toThrow(/non-negative integer/);
  });
});

describe('formatRate', () => {
  it('renders at full scale', () => {
    expect(formatRate(rateFromDecimalString('EUR', 'USD', '1.0845'))).toBe('1.08450000');
    expect(formatRate({ from: 'EUR', to: 'USD', value: 5n, scale: RATE_SCALE })).toBe('0.00000005');
  });
});
