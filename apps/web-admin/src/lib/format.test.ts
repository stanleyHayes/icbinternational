/// <reference types="jest" />
/**
 * Operational formatting is fixed-width and unambiguous by design; these hold it to that.
 */

import {
  daysBetween,
  formatBasisPoints,
  formatCount,
  formatDate,
  formatElapsed,
  formatInstant,
  humaniseCode,
  isOverdue,
  shortenId,
  weeksBetween,
} from './format';

const NOW = Date.parse('2026-08-03T12:00:00.000Z');
const NOT_SET = '—';

describe('formatInstant', () => {
  it('renders to the second, in UTC', () => {
    expect(formatInstant('2026-08-03T14:22:07.000Z')).toBe('03/08/2026, 14:22:07');
  });

  it('renders an absent value as a placeholder rather than an empty cell', () => {
    expect(formatInstant(null)).toBe(NOT_SET);
  });

  it('does not render "Invalid Date" for a malformed value', () => {
    expect(formatInstant('not a date')).toBe(NOT_SET);
  });
});

describe('formatDate', () => {
  it('drops the time', () => {
    expect(formatDate('2026-08-03T14:22:07.000Z')).toBe('03/08/2026');
  });
});

describe('formatElapsed', () => {
  it.each([
    ['2026-08-03T11:59:30.000Z', '30s ago'],
    ['2026-08-03T11:56:00.000Z', '4m ago'],
    ['2026-08-03T10:00:00.000Z', '2h ago'],
    ['2026-07-31T12:00:00.000Z', '3d ago'],
  ])('describes %s as %s', (instant, expected) => {
    expect(formatElapsed(instant, NOW)).toBe(expected);
  });

  it('looks forward for a deadline that has not passed', () => {
    expect(formatElapsed('2026-08-03T14:00:00.000Z', NOW)).toBe('in 2h');
  });
});

describe('isOverdue', () => {
  it('is true once the deadline has passed', () => {
    expect(isOverdue('2026-08-03T11:59:59.000Z', NOW)).toBe(true);
  });

  it('is false for a deadline still ahead', () => {
    expect(isOverdue('2026-08-03T12:00:01.000Z', NOW)).toBe(false);
  });

  it('is false when there is no deadline at all', () => {
    expect(isOverdue(null, NOW)).toBe(false);
  });
});

describe('shortenId', () => {
  it('keeps the prefix and both ends', () => {
    expect(shortenId('usr_01J8ZQ4M7T2K9XY3B5N4K2')).toBe('usr_01J8…N4K2');
  });

  it('leaves a short id alone', () => {
    expect(shortenId('usr_01J8')).toBe('usr_01J8');
  });

  it('leaves an unprefixed value alone', () => {
    expect(shortenId('reference-without-a-prefix')).toBe('reference-without-a-prefix');
  });
});

describe('humaniseCode', () => {
  it('turns a contract enum into a sentence fragment', () => {
    expect(humaniseCode('MORE_INFO_REQUIRED')).toBe('More info required');
  });
});

describe('numbers', () => {
  it('formats basis points as a percentage', () => {
    expect(formatBasisPoints(250)).toBe('2.50%');
  });

  it('groups thousands in a count', () => {
    expect(formatCount(1_234_567)).toBe('1,234,567');
  });
});

describe('spans', () => {
  it('counts whole days', () => {
    expect(daysBetween('2026-08-01T00:00:00.000Z', '2026-08-03T23:00:00.000Z')).toBe(2);
  });

  it('counts whole weeks', () => {
    expect(weeksBetween('2026-07-01T00:00:00.000Z', '2026-08-03T00:00:00.000Z')).toBe(4);
  });
});
