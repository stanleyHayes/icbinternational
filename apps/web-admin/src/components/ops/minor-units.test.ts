import {
  absoluteMinor,
  compareMinor,
  isPositiveMinor,
  isZeroMinor,
  negateMinor,
  subtractMinor,
  sumAmounts,
  sumMinor,
} from './minor-units';

describe('sumMinor', () => {
  it('adds amounts that a double could not hold', () => {
    expect(sumMinor(['9007199254740993', '1'])).toBe('9007199254740994');
  });

  it('adds nothing to zero', () => {
    expect(sumMinor([])).toBe('0');
  });

  it('handles negative amounts, which a ledger total routinely contains', () => {
    expect(sumMinor(['1000', '-2500'])).toBe('-1500');
  });
});

describe('sumAmounts', () => {
  it('adds the amount of each money object', () => {
    const total = sumAmounts([
      { amount: '1999', currency: 'GBP' },
      { amount: '1', currency: 'GBP' },
    ]);

    expect(total).toBe('2000');
  });
});

describe('arithmetic helpers', () => {
  it('subtracts without precision loss', () => {
    expect(subtractMinor('9007199254740993', '9007199254740992')).toBe('1');
  });

  it('negates', () => {
    expect(negateMinor('2500')).toBe('-2500');
    expect(negateMinor('-2500')).toBe('2500');
  });

  it('takes a magnitude', () => {
    expect(absoluteMinor('-2500')).toBe('2500');
    expect(absoluteMinor('2500')).toBe('2500');
  });

  it('recognises zero however it is written', () => {
    expect(isZeroMinor('0')).toBe(true);
    expect(isZeroMinor('-0')).toBe(true);
    expect(isZeroMinor('1')).toBe(false);
  });

  it('recognises a positive amount', () => {
    expect(isPositiveMinor('1')).toBe(true);
    expect(isPositiveMinor('0')).toBe(false);
    expect(isPositiveMinor('-1')).toBe(false);
  });
});

describe('compareMinor', () => {
  it('orders by value rather than by text', () => {
    expect(compareMinor('999', '1000')).toBeLessThan(0);
    expect(compareMinor('1000', '999')).toBeGreaterThan(0);
    expect(compareMinor('1000', '1000')).toBe(0);
  });

  it('sorts a column of amounts correctly beyond the safe integer range', () => {
    const sorted = ['9007199254740993', '9007199254740992', '10'].toSorted(compareMinor);
    expect(sorted).toEqual(['10', '9007199254740992', '9007199254740993']);
  });
});
