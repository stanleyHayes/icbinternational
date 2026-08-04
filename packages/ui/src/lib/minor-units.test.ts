/**
 * The guard that keeps floats out of the UI. Every money component funnels through it, so its
 * rejection set is the package's real definition of "a valid amount".
 */

import { digitsOnly, InvalidMinorUnitsError, isMinorUnits, toMinorUnits } from './minor-units.js';

describe('toMinorUnits', () => {
  it.each([
    ['0', 0n],
    ['1', 1n],
    ['-1', -1n],
    ['125000', 125000n],
    ['-9007199254740993', -9007199254740993n],
    ['0000123', 123n],
  ])('parses %p', (input, expected) => {
    expect(toMinorUnits(input)).toBe(expected);
  });

  it.each(['12.50', '.5', '1.', '1e3', '0x10', '', ' ', ' 100', '100 ', '1,000', '+5', 'NaN'])(
    'rejects %p',
    (input) => {
      expect(() => toMinorUnits(input)).toThrow(InvalidMinorUnitsError);
    },
  );

  it('rejects a number even when it is integral', () => {
    expect(() => toMinorUnits(1234 as unknown as string)).toThrow(InvalidMinorUnitsError);
  });

  it('names the offending value in the message so the bad call site is findable', () => {
    expect(() => toMinorUnits('12.50')).toThrow(/12\.50/);
  });
});

describe('isMinorUnits', () => {
  it('accepts what toMinorUnits accepts and rejects what it rejects', () => {
    expect(isMinorUnits('-42')).toBe(true);
    expect(isMinorUnits('4.2')).toBe(false);
    expect(isMinorUnits(42)).toBe(false);
    expect(isMinorUnits(null)).toBe(false);
    expect(isMinorUnits(undefined)).toBe(false);
  });
});

describe('digitsOnly', () => {
  it('keeps digits and discards separators, symbols and spaces', () => {
    expect(digitsOnly('£1,234.56')).toBe('123456');
    expect(digitsOnly('-12')).toBe('12');
    expect(digitsOnly('abc')).toBe('');
  });
});
