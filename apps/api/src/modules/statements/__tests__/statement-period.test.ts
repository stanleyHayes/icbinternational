import {
  archivePeriods,
  customPeriod,
  monthlyPeriod,
  periodFromDays,
} from '../statement-period.js';

describe('monthlyPeriod', () => {
  it('covers the month to its last millisecond', () => {
    const january = monthlyPeriod(2026, 0);

    expect(january.label).toBe('2026-01');
    expect(january.start.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(january.end.toISOString()).toBe('2026-01-31T23:59:59.999Z');
  });

  it('knows how long February is in a leap year', () => {
    expect(monthlyPeriod(2024, 1).endDay).toBe('2024-02-29');
    expect(monthlyPeriod(2026, 1).endDay).toBe('2026-02-28');
  });
});

describe('archivePeriods', () => {
  const openedAt = new Date('2025-11-14T09:00:00.000Z');

  it('lists complete months newest first, excluding the one in progress', () => {
    const periods = archivePeriods({
      openedAt,
      asOf: new Date('2026-03-04T12:00:00.000Z'),
      limit: 10,
    });

    expect(periods.map((period) => period.label)).toEqual([
      '2026-02',
      '2026-01',
      '2025-12',
      '2025-11',
    ]);
  });

  it('is empty until the account has been open for a whole month', () => {
    expect(
      archivePeriods({ openedAt, asOf: new Date('2025-11-30T23:00:00.000Z'), limit: 10 }),
    ).toEqual([]);
  });

  it('stops at the limit asked for', () => {
    const periods = archivePeriods({
      openedAt,
      asOf: new Date('2026-03-04T12:00:00.000Z'),
      limit: 2,
    });
    expect(periods.map((period) => period.label)).toEqual(['2026-02', '2026-01']);
  });
});

describe('customPeriod', () => {
  it('spans both days inclusively', () => {
    const period = customPeriod('2026-01-05', '2026-02-04');

    expect(period.label).toBe('2026-01-05 to 2026-02-04');
    expect(period.start.toISOString()).toBe('2026-01-05T00:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-02-04T23:59:59.999Z');
  });

  it('refuses an inverted range rather than answering it with nothing', () => {
    expect(() => customPeriod('2026-02-04', '2026-01-05')).toThrow(/must not be after/);
  });

  it('refuses a range wider than a year', () => {
    expect(() => customPeriod('2024-01-01', '2026-01-01')).toThrow(/at most/);
  });
});

describe('periodFromDays', () => {
  it('recognises a whole month and labels it as one', () => {
    const january = monthlyPeriod(2026, 0);
    const rebuilt = periodFromDays(
      Math.floor(january.start.getTime() / 86_400_000),
      Math.floor(january.end.getTime() / 86_400_000),
    );

    expect(rebuilt.label).toBe('2026-01');
    expect(rebuilt.end.toISOString()).toBe(january.end.toISOString());
  });
});
