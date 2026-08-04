import { toMinorUnits, toPostingQuery } from './posting-filters';

describe('toMinorUnits', () => {
  it('reads a whole amount', () => {
    expect(toMinorUnits('1000')).toBe('100000');
  });

  it('reads pence', () => {
    expect(toMinorUnits('19.99')).toBe('1999');
  });

  it('pads a single decimal place rather than truncating it', () => {
    expect(toMinorUnits('19.9')).toBe('1990');
  });

  it('ignores surrounding whitespace', () => {
    expect(toMinorUnits('  42.50 ')).toBe('4250');
  });

  it('refuses anything that is not an amount', () => {
    expect(toMinorUnits('nineteen')).toBeUndefined();
    expect(toMinorUnits('19.999')).toBeUndefined();
    expect(toMinorUnits('-19.99')).toBeUndefined();
    expect(toMinorUnits('')).toBeUndefined();
  });

  it('handles an amount larger than a double could hold exactly', () => {
    expect(toMinorUnits('90071992547409.93')).toBe('9007199254740993');
  });
});

describe('toPostingQuery', () => {
  const LIMIT = 50;

  it('sends only the limit when nothing is filtered', () => {
    expect(toPostingQuery({}, LIMIT)).toEqual({ limit: LIMIT });
  });

  it('omits a filter the operator has cleared rather than sending an empty value', () => {
    expect(toPostingQuery({ search: '   ', status: '' }, LIMIT)).toEqual({ limit: LIMIT });
  });

  it('turns a date into the whole of that day in UTC', () => {
    const query = toPostingQuery({ from: '2026-08-03', to: '2026-08-03' }, LIMIT);
    expect(query.from).toBe('2026-08-03T00:00:00Z');
    expect(query.to).toBe('2026-08-03T23:59:59Z');
  });

  it('converts amount bounds to minor units', () => {
    const query = toPostingQuery({ minAmount: '10.00', maxAmount: '250' }, LIMIT);
    expect(query.minAmount).toBe('1000');
    expect(query.maxAmount).toBe('25000');
  });

  it('passes the enumerated filters through', () => {
    const query = toPostingQuery({ direction: 'DEBIT', status: 'COMPLETED' }, LIMIT);
    expect(query.direction).toBe('DEBIT');
    expect(query.status).toBe('COMPLETED');
  });
});
