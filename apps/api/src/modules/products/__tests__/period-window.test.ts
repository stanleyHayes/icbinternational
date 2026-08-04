import { AppError } from '../../../common/errors/app-error.js';
import { assertTimeZone, dayWindow, monthWindow, retentionEnd } from '../period-window.js';

/**
 * The whole point of these tests is the hour either side of a DST transition.
 *
 * A daily limit that resets at the wrong instant either gives a customer a second
 * allowance an hour early or holds their existing one an hour late, and both look like a
 * bug in the limit engine rather than a bug in a timezone conversion.
 */

const LONDON = 'Europe/London';
const NEW_YORK = 'America/New_York';
const KATHMANDU = 'Asia/Kathmandu';
const AUCKLAND = 'Pacific/Auckland';

describe('dayWindow', () => {
  it('keys on the local calendar day, not the UTC one', () => {
    // 23:30 in New York on 14 March is 03:30 UTC on 15 March.
    const instant = new Date('2026-03-15T03:30:00.000Z');

    expect(dayWindow(instant, NEW_YORK).key).toBe('2026-03-14');
    expect(dayWindow(instant, LONDON).key).toBe('2026-03-15');
  });

  it('resets at the next local midnight during British Summer Time', () => {
    // 1 July is BST, so London is UTC+1 and local midnight is 23:00 UTC the day before.
    const window = dayWindow(new Date('2026-07-01T12:00:00.000Z'), LONDON);

    expect(window.key).toBe('2026-07-01');
    expect(window.resetsAt.toISOString()).toBe('2026-07-01T23:00:00.000Z');
  });

  it('resets at UTC midnight in winter, when London is on GMT', () => {
    const window = dayWindow(new Date('2026-01-15T12:00:00.000Z'), LONDON);

    expect(window.key).toBe('2026-01-15');
    expect(window.resetsAt.toISOString()).toBe('2026-01-16T00:00:00.000Z');
  });

  it('lands on the true boundary across the spring-forward transition', () => {
    // Clocks go forward at 01:00 UTC on 29 March 2026. The day that begins at that
    // boundary is 23 hours long, and the naive offset from the day before is wrong by one.
    const window = dayWindow(new Date('2026-03-28T20:00:00.000Z'), LONDON);

    expect(window.key).toBe('2026-03-28');
    expect(window.resetsAt.toISOString()).toBe('2026-03-29T00:00:00.000Z');
  });

  it('lands on the true boundary across the autumn fall-back transition', () => {
    // Clocks go back at 02:00 BST (01:00 UTC) on 25 October 2026, making that day 25 hours.
    const window = dayWindow(new Date('2026-10-24T20:00:00.000Z'), LONDON);

    expect(window.key).toBe('2026-10-24');
    expect(window.resetsAt.toISOString()).toBe('2026-10-24T23:00:00.000Z');
  });

  it('handles a zone offset that is not a whole number of hours', () => {
    // Kathmandu is UTC+05:45 all year.
    const window = dayWindow(new Date('2026-05-10T12:00:00.000Z'), KATHMANDU);

    expect(window.key).toBe('2026-05-10');
    expect(window.resetsAt.toISOString()).toBe('2026-05-10T18:15:00.000Z');
  });

  it('rolls the month and the year over at the end of December', () => {
    const window = dayWindow(new Date('2026-12-31T12:00:00.000Z'), LONDON);

    expect(window.key).toBe('2026-12-31');
    expect(window.resetsAt.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('reads a zone ahead of UTC as being on the following day', () => {
    // 21:00 UTC is 10:00 the next morning in Auckland during their summer.
    const window = dayWindow(new Date('2026-01-05T21:00:00.000Z'), AUCKLAND);

    expect(window.key).toBe('2026-01-06');
  });
});

describe('monthWindow', () => {
  it('keys on the local year and month', () => {
    expect(monthWindow(new Date('2026-07-15T12:00:00.000Z'), LONDON).key).toBe('2026-07');
  });

  it('resets at local midnight on the first of the following month', () => {
    const window = monthWindow(new Date('2026-07-15T12:00:00.000Z'), LONDON);

    expect(window.resetsAt.toISOString()).toBe('2026-07-31T23:00:00.000Z');
  });

  it('rolls December into January of the next year', () => {
    const window = monthWindow(new Date('2026-12-15T12:00:00.000Z'), LONDON);

    expect(window.key).toBe('2026-12');
    expect(window.resetsAt.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('uses the local month even when UTC has already moved on', () => {
    // 00:30 UTC on 1 August is still 20:30 on 31 July in New York.
    const window = monthWindow(new Date('2026-08-01T00:30:00.000Z'), NEW_YORK);

    expect(window.key).toBe('2026-07');
  });
});

describe('assertTimeZone', () => {
  it('returns a recognised zone unchanged', () => {
    expect(assertTimeZone(LONDON)).toBe(LONDON);
  });

  it('rejects a zone the platform does not know', () => {
    expect(() => assertTimeZone('Mars/Olympus_Mons')).toThrow(AppError);
  });
});

describe('retentionEnd', () => {
  it('keeps a counter for a week past its reset so support can explain a decline', () => {
    expect(retentionEnd(new Date('2026-07-01T23:00:00.000Z')).toISOString()).toBe(
      '2026-07-08T23:00:00.000Z',
    );
  });
});
