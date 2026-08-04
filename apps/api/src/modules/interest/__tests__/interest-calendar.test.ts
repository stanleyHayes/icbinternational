import { rejectionFrom } from '../../accounts/__tests__/accounts-harness.js';
import {
  assertValidPeriod,
  lastDayOfPeriod,
  periodOf,
  previousPeriod,
} from '../interest-calendar.js';

/**
 * Period arithmetic: the dates a capitalisation settles and the value date it books.
 * Wrong here and interest lands in the wrong statement month.
 */

describe('previousPeriod', () => {
  it('is the month before the one today falls in', () => {
    expect(previousPeriod('2026-03-14')).toBe('2026-02');
    expect(previousPeriod('2026-03-01')).toBe('2026-02');
  });

  it('rolls over the year in January', () => {
    expect(previousPeriod('2026-01-01')).toBe('2025-12');
  });
});

describe('lastDayOfPeriod', () => {
  it('is the value date of the payout', () => {
    expect(lastDayOfPeriod('2026-01')).toBe('2026-01-31');
    expect(lastDayOfPeriod('2026-04')).toBe('2026-04-30');
  });

  it('knows February in common and leap years', () => {
    expect(lastDayOfPeriod('2026-02')).toBe('2026-02-28');
    expect(lastDayOfPeriod('2024-02')).toBe('2024-02-29');
  });
});

describe('periodOf', () => {
  it('is the month an ISO date falls in', () => {
    expect(periodOf('2026-12-31')).toBe('2026-12');
  });
});

describe('assertValidPeriod', () => {
  it('accepts a well-formed period', () => {
    expect(() => assertValidPeriod('2026-12')).not.toThrow();
  });

  it('rejects a thirteenth month and free text alike', () => {
    return expect(
      rejectionFrom(Promise.resolve().then(() => assertValidPeriod('2026-13'))),
    ).resolves.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
