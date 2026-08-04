import {
  isKnownTimezone,
  isWithinQuietHours,
  minutesOfDayIn,
  parseClockTime,
  quietHoursEndAfter,
} from '../preferences/quiet-hours.js';

const LONDON = 'Europe/London';

/** 22:00–07:00, the window the preferences screen offers by default. */
const WRAPPING = { from: '22:00', to: '07:00' } as const;

/** March 2026 is still GMT in London, so UTC and local times coincide here. */
const LATE_EVENING = new Date('2026-03-14T23:30:00.000Z');
const MIDDAY = new Date('2026-03-14T12:00:00.000Z');

describe('parseClockTime', () => {
  it('reads a valid 24-hour time as minutes since midnight', () => {
    expect(parseClockTime('22:00')).toBe(1320);
    expect(parseClockTime('00:00')).toBe(0);
    expect(parseClockTime('07:05')).toBe(425);
  });

  it('rejects times that are not HH:mm', () => {
    expect(parseClockTime('24:00')).toBeNull();
    expect(parseClockTime('9:30')).toBeNull();
    expect(parseClockTime('22:60')).toBeNull();
    expect(parseClockTime('late')).toBeNull();
  });
});

describe('minutesOfDayIn', () => {
  it('reads the instant in the requested timezone, not UTC', () => {
    // 22:30 UTC on 1 July is 23:30 in London (BST).
    expect(minutesOfDayIn(new Date('2026-07-01T22:30:00.000Z'), LONDON)).toBe(1410);
    expect(minutesOfDayIn(LATE_EVENING, LONDON)).toBe(1410);
  });
});

describe('isWithinQuietHours', () => {
  it('matches a late evening inside a window that wraps midnight', () => {
    expect(isWithinQuietHours(LATE_EVENING, WRAPPING, LONDON)).toBe(true);
  });

  it('matches the small hours on the far side of midnight', () => {
    expect(isWithinQuietHours(new Date('2026-03-15T02:15:00.000Z'), WRAPPING, LONDON)).toBe(true);
  });

  it('does not match the middle of the day', () => {
    expect(isWithinQuietHours(MIDDAY, WRAPPING, LONDON)).toBe(false);
  });

  it('treats the start as inclusive and the end as exclusive', () => {
    expect(isWithinQuietHours(new Date('2026-03-14T22:00:00.000Z'), WRAPPING, LONDON)).toBe(true);
    expect(isWithinQuietHours(new Date('2026-03-15T07:00:00.000Z'), WRAPPING, LONDON)).toBe(false);
  });

  it('honours daylight saving, the case a fixed UTC offset gets wrong', () => {
    // 22:30 UTC in July is 23:30 in London: inside 22:00–07:00 even though the
    // UTC clock reading is not.
    expect(isWithinQuietHours(new Date('2026-07-01T22:30:00.000Z'), WRAPPING, LONDON)).toBe(true);
  });

  it('handles a window that does not wrap midnight', () => {
    const working = { from: '09:00', to: '17:00' };

    expect(isWithinQuietHours(MIDDAY, working, LONDON)).toBe(true);
    expect(isWithinQuietHours(LATE_EVENING, working, LONDON)).toBe(false);
  });

  it('treats a zero-length window as no window', () => {
    expect(isWithinQuietHours(LATE_EVENING, { from: '22:00', to: '22:00' }, LONDON)).toBe(false);
  });
});

describe('quietHoursEndAfter', () => {
  it('returns the next window end after a late-evening instant', () => {
    expect(quietHoursEndAfter(LATE_EVENING, WRAPPING, LONDON)).toEqual(
      new Date('2026-03-15T07:00:00.000Z'),
    );
  });

  it('returns the same morning when the instant is past midnight', () => {
    expect(quietHoursEndAfter(new Date('2026-03-15T02:15:00.000Z'), WRAPPING, LONDON)).toEqual(
      new Date('2026-03-15T07:00:00.000Z'),
    );
  });
});

describe('isKnownTimezone', () => {
  it('accepts an IANA name and rejects nonsense', () => {
    expect(isKnownTimezone(LONDON)).toBe(true);
    expect(isKnownTimezone('Middle/Earth')).toBe(false);
  });
});
