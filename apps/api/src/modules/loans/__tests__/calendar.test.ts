import {
  addDays,
  addMonths,
  addWeeks,
  daysBetween,
  fromIsoDate,
  isBefore,
  laterOf,
  monthsBetween,
  toIsoDate,
} from '../calendar.js';

/**
 * Calendar arithmetic, tested on the days it actually goes wrong.
 *
 * Month ends, leap years and the boundary between one whole month and a part month. Every
 * instalment date, maturity date and auto-save date in the credit lane is built from these
 * four functions, so a bug here shows up as a customer being charged on the wrong day.
 */

describe('addMonths', () => {
  const cases: [string, number, string][] = [
    ['2026-01-15', 1, '2026-02-15'],
    ['2026-01-31', 1, '2026-02-28'],
    ['2028-01-31', 1, '2028-02-29'],
    ['2026-01-31', 3, '2026-04-30'],
    ['2026-12-31', 1, '2027-01-31'],
    ['2026-03-31', -1, '2026-02-28'],
    ['2026-06-15', 12, '2027-06-15'],
    ['2026-05-15', 0, '2026-05-15'],
  ];

  it.each(cases)('%s plus %i months is %s', (from, months, expected) => {
    expect(addMonths(from, months)).toBe(expected);
  });

  it('never rolls a month end into the following month', () => {
    const dates = Array.from({ length: 12 }, (_, index) => addMonths('2026-01-31', index + 1));

    expect(dates.every((date) => Number(date.slice(8)) >= 28)).toBe(true);
  });
});

describe('addDays and addWeeks', () => {
  it('crosses a month boundary', () => {
    expect(addDays('2026-01-30', 3)).toBe('2026-02-02');
  });

  it('crosses a year boundary', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('moves whole weeks', () => {
    expect(addWeeks('2026-03-05', 2)).toBe('2026-03-19');
  });
});

describe('daysBetween', () => {
  it('counts forwards', () => {
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30);
  });

  it('is negative when the dates are the other way round', () => {
    expect(daysBetween('2026-01-31', '2026-01-01')).toBe(-30);
  });

  it('is nil on the same day', () => {
    expect(daysBetween('2026-06-15', '2026-06-15')).toBe(0);
  });

  it('counts a leap year as 366 days', () => {
    expect(daysBetween('2028-01-01', '2029-01-01')).toBe(366);
  });
});

describe('monthsBetween', () => {
  it('does not count a part month', () => {
    expect(monthsBetween('2026-03-15', '2026-04-14')).toBe(0);
  });

  it('counts the month once the day of month is reached', () => {
    expect(monthsBetween('2026-03-15', '2026-04-15')).toBe(1);
  });

  it('counts whole years', () => {
    expect(monthsBetween('2026-03-15', '2027-03-15')).toBe(12);
  });

  it('is negative when the dates are the other way round', () => {
    expect(monthsBetween('2026-06-15', '2026-03-15')).toBe(-3);
  });
});

describe('toIsoDate and fromIsoDate', () => {
  it('round-trips a date through UTC midnight', () => {
    expect(toIsoDate(fromIsoDate('2026-07-04'))).toBe('2026-07-04');
  });

  it('takes the UTC day, not a local one', () => {
    expect(toIsoDate(new Date('2026-07-04T23:30:00.000Z'))).toBe('2026-07-04');
  });

  it('refuses a string that is not a calendar date', () => {
    expect(() => fromIsoDate('the fifteenth')).toThrow(RangeError);
  });
});

describe('isBefore and laterOf', () => {
  it('orders calendar dates lexicographically, which ISO-8601 guarantees', () => {
    expect(isBefore('2026-01-31', '2026-02-01')).toBe(true);
    expect(isBefore('2026-02-01', '2026-01-31')).toBe(false);
  });

  it('picks the later of two dates', () => {
    expect(laterOf('2026-01-31', '2026-02-01')).toBe('2026-02-01');
  });
});
