import { CURRENCIES, CURRENCY_CODES } from '../currency.js';
import {
  CurrencyMismatchError,
  InvalidAllocationError,
  InvalidAmountError,
  MoneyError,
} from '../money.errors.js';

describe('error hierarchy', () => {
  const cases = [
    new CurrencyMismatchError('USD', 'EUR'),
    new InvalidAmountError('abc', 'not a number'),
    new InvalidAllocationError('no weights supplied'),
  ];

  it.each(cases)('$name descends from MoneyError and from Error', (error) => {
    expect(error).toBeInstanceOf(MoneyError);
    expect(error).toBeInstanceOf(Error);
  });

  it('names itself after its concrete class, so logs are readable', () => {
    expect(cases.map((error) => error.name)).toEqual([
      'CurrencyMismatchError',
      'InvalidAmountError',
      'InvalidAllocationError',
    ]);
  });

  it('keeps the offending values on the error for the API layer to surface', () => {
    const mismatch = new CurrencyMismatchError('USD', 'EUR');
    expect([mismatch.left, mismatch.right]).toEqual(['USD', 'EUR']);
    expect(new InvalidAmountError({ nested: true }, 'bad').value).toEqual({ nested: true });
  });

  it('explains why implicit conversion is refused', () => {
    expect(new CurrencyMismatchError('USD', 'EUR').message).toMatch(/hide the rate and the spread/);
  });
});

describe('CURRENCIES', () => {
  it('exposes one frozen entry per declared code', () => {
    expect(CURRENCIES).toHaveLength(CURRENCY_CODES.length);
    expect(Object.isFrozen(CURRENCIES)).toBe(true);
    const byCode = (left: string, right: string) => left.localeCompare(right);
    expect(CURRENCIES.map((currency) => currency.code).sort(byCode)).toEqual(
      [...CURRENCY_CODES].sort(byCode),
    );
  });

  it('gives every currency a symbol and a name', () => {
    for (const currency of CURRENCIES) {
      expect(currency.symbol.length).toBeGreaterThan(0);
      expect(currency.name.length).toBeGreaterThan(0);
      expect(currency.exponent).toBeGreaterThanOrEqual(0);
    }
  });
});
