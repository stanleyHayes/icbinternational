import fc from 'fast-check';

import { CURRENCY_CODES, getCurrency, isCurrencyCode, minorUnitScale } from '../currency.js';
import { accountingFormat, formatMinor } from '../format.js';
import { InvalidAmountError } from '../money.errors.js';
import { formatMinorToMajor, parseMajorToMinor } from '../parse.js';

describe('currency registry', () => {
  it('recognises supported codes and rejects everything else', () => {
    expect(isCurrencyCode('USD')).toBe(true);
    expect(isCurrencyCode('XYZ')).toBe(false);
    expect(isCurrencyCode(42)).toBe(false);
  });

  it('throws rather than defaulting for an unknown code', () => {
    expect(() => getCurrency('XYZ' as never)).toThrow(RangeError);
  });

  it.each([
    ['JPY', 0, 1n],
    ['USD', 2, 100n],
    ['KWD', 3, 1000n],
  ])('%s subdivides into 10^%i minor units', (code, exponent, scale) => {
    expect(getCurrency(code as never).exponent).toBe(exponent);
    expect(minorUnitScale(code as never)).toBe(scale);
  });

  it('has a complete, unique entry for every declared code', () => {
    const numericCodes = CURRENCY_CODES.map((code) => getCurrency(code).numericCode);
    expect(new Set(numericCodes).size).toBe(CURRENCY_CODES.length);
  });
});

describe('parseMajorToMinor', () => {
  it.each([
    ['1234.56', 'USD', 123456n],
    ['1,234.56', 'USD', 123456n],
    ['1,234,567.89', 'USD', 123456789n],
    ['0.01', 'USD', 1n],
    ['-0.01', 'USD', -1n],
    ['+5.00', 'USD', 500n],
    ['10', 'USD', 1000n],
    ['10.5', 'USD', 1050n],
    ['1234', 'JPY', 1234n],
    ['1.234', 'KWD', 1234n],
  ])('parses %s as %s', (input, currency, expected) => {
    expect(parseMajorToMinor(input, currency as never)).toBe(expected);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseMajorToMinor('  12.34  ', 'USD')).toBe(1234n);
  });

  it.each([
    ['', 'empty string'],
    ['abc', 'not a number'],
    ['1.2.3', 'two separators'],
    ['1,23.45', 'malformed grouping'],
    ['$12.34', 'currency symbol'],
    ['1 234.56', 'space grouping'],
  ])('rejects %p (%s)', (input) => {
    expect(() => parseMajorToMinor(input, 'USD')).toThrow(InvalidAmountError);
  });

  it('rejects more decimal places than the currency supports, rather than rounding', () => {
    expect(() => parseMajorToMinor('10.005', 'USD')).toThrow(/supports 2 decimal place/);
    expect(() => parseMajorToMinor('10.5', 'JPY')).toThrow(/supports 0 decimal place/);
  });
});

describe('formatMinorToMajor', () => {
  it.each([
    [123456n, 'USD', '1234.56'],
    [-123456n, 'USD', '-1234.56'],
    [1n, 'USD', '0.01'],
    [0n, 'USD', '0.00'],
    [1234n, 'JPY', '1234'],
    [0n, 'JPY', '0'],
    [1234n, 'KWD', '1.234'],
    [-5n, 'KWD', '-0.005'],
  ])('renders %s %s as %s', (minor, currency, expected) => {
    expect(formatMinorToMajor(minor, currency as never)).toBe(expected);
  });

  it('round-trips any minor amount through the parser', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -(10n ** 12n), max: 10n ** 12n }),
        fc.constantFrom(...CURRENCY_CODES),
        (minor, currency) => {
          expect(parseMajorToMinor(formatMinorToMajor(minor, currency), currency)).toBe(minor);
        },
      ),
      { numRuns: 400 },
    );
  });
});

describe('formatMinor', () => {
  it('applies the locale', () => {
    expect(formatMinor(123456n, 'USD')).toBe('$1,234.56');
    expect(formatMinor(123456n, 'EUR', { locale: 'de-DE' })).toContain('1.234,56');
  });

  it('honours the currency display mode', () => {
    expect(formatMinor(123456n, 'USD', { display: 'none' })).toBe('1,234.56');
    expect(formatMinor(123456n, 'USD', { display: 'code' })).toContain('USD');
    expect(formatMinor(123456n, 'USD', { display: 'name' })).toContain('dollar');
  });

  it('can force a sign for credit rows', () => {
    expect(formatMinor(500n, 'USD', { signDisplay: 'always' })).toBe('+$5.00');
  });

  it('can disable grouping and use compact notation', () => {
    expect(formatMinor(123456n, 'USD', { useGrouping: false })).toBe('$1234.56');
    expect(formatMinor(120_000_00n, 'USD', { compact: true })).toBe('$120K');
  });

  it('formats zero-exponent currencies without decimals', () => {
    expect(formatMinor(1234n, 'JPY')).toBe('¥1,234');
  });
});

describe('accountingFormat', () => {
  it('parenthesises negatives and leaves positives alone', () => {
    expect(accountingFormat(-123456n, 'USD')).toBe('($1,234.56)');
    expect(accountingFormat(123456n, 'USD')).toBe('$1,234.56');
    expect(accountingFormat(0n, 'USD')).toBe('$0.00');
  });
});
