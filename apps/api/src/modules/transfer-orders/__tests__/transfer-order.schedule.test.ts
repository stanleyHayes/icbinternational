import { RecurrenceFrequency } from '@reliance/contracts';

import {
  anchorsFor,
  firstRunOn,
  nextRunOn,
  runFrom,
  type Schedule,
} from '../transfer-order.schedule.js';

function schedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    frequency: RecurrenceFrequency.MONTHLY,
    dayOfMonth: 31,
    dayOfWeek: null,
    startsOn: '2026-01-31',
    endsOn: null,
    maxOccurrences: null,
    ...overrides,
  };
}

describe('month-ends', () => {
  it('clamps February and returns to the 31st afterwards', () => {
    const rule = schedule();

    expect(firstRunOn(rule)).toBe('2026-01-31');
    expect(nextRunOn(rule, { after: '2026-01-31', occurrencesRun: 1 })).toBe('2026-02-28');
    expect(nextRunOn(rule, { after: '2026-02-28', occurrencesRun: 2 })).toBe('2026-03-31');
    expect(nextRunOn(rule, { after: '2026-03-31', occurrencesRun: 3 })).toBe('2026-04-30');
  });

  it('clamps to 29 February in a leap year', () => {
    const rule = schedule({ startsOn: '2028-01-31' });

    expect(nextRunOn(rule, { after: '2028-01-31', occurrencesRun: 1 })).toBe('2028-02-29');
  });

  it('keeps the 30th out of February rather than rolling into March', () => {
    const rule = schedule({ dayOfMonth: 30, startsOn: '2026-01-30' });

    expect(nextRunOn(rule, { after: '2026-01-30', occurrencesRun: 1 })).toBe('2026-02-28');
    expect(nextRunOn(rule, { after: '2026-02-28', occurrencesRun: 2 })).toBe('2026-03-30');
  });

  it('holds the 29th of February for an annual order in the years it does not exist', () => {
    const rule = schedule({
      frequency: RecurrenceFrequency.ANNUAL,
      dayOfMonth: 29,
      startsOn: '2028-02-29',
    });

    expect(nextRunOn(rule, { after: '2028-02-29', occurrencesRun: 1 })).toBe('2029-02-28');
    expect(runFrom(rule, { from: '2032-01-01', occurrencesRun: 4 })).toBe('2032-02-29');
  });
});

describe('finding the next date', () => {
  it('lands on the right month in one step after a long pause', () => {
    const rule = schedule({ frequency: RecurrenceFrequency.QUARTERLY, startsOn: '2024-01-31' });

    expect(runFrom(rule, { from: '2026-08-04', occurrencesRun: 0 })).toBe('2026-10-31');
  });

  it('takes the day this month when it has not passed yet', () => {
    const rule = schedule({ dayOfMonth: 20, startsOn: '2026-01-05' });

    expect(runFrom(rule, { from: '2026-03-11', occurrencesRun: 0 })).toBe('2026-03-20');
  });

  it('moves to next month when the day has already passed', () => {
    const rule = schedule({ dayOfMonth: 5, startsOn: '2026-01-05' });

    expect(runFrom(rule, { from: '2026-03-20', occurrencesRun: 0 })).toBe('2026-04-05');
  });

  it('never returns the date it was asked to move past', () => {
    const rule = schedule({ frequency: RecurrenceFrequency.DAILY, dayOfMonth: null });

    expect(nextRunOn(rule, { after: '2026-06-10', occurrencesRun: 3 })).toBe('2026-06-11');
  });
});

describe('weekly cadences', () => {
  it('finds the chosen weekday from a start date that is not on it', () => {
    // 2026-08-05 is a Wednesday; Monday is ISO weekday 1.
    const rule = schedule({
      frequency: RecurrenceFrequency.WEEKLY,
      dayOfMonth: null,
      dayOfWeek: 1,
      startsOn: '2026-08-05',
    });

    expect(firstRunOn(rule)).toBe('2026-08-10');
    expect(nextRunOn(rule, { after: '2026-08-10', occurrencesRun: 1 })).toBe('2026-08-17');
  });

  it('steps a fortnight at a time and stays on the same weekday', () => {
    const rule = schedule({
      frequency: RecurrenceFrequency.FORTNIGHTLY,
      dayOfMonth: null,
      dayOfWeek: 5,
      startsOn: '2026-08-05',
    });

    expect(firstRunOn(rule)).toBe('2026-08-07');
    expect(runFrom(rule, { from: '2026-09-01', occurrencesRun: 0 })).toBe('2026-09-04');
  });

  it('defaults the weekday to the one the order starts on', () => {
    expect(anchorsFor({ frequency: RecurrenceFrequency.WEEKLY, startsOn: '2026-08-05' })).toEqual({
      dayOfMonth: null,
      dayOfWeek: 3,
    });
  });

  it('defaults a Sunday start to ISO 7 rather than JavaScript’s 0', () => {
    expect(anchorsFor({ frequency: RecurrenceFrequency.WEEKLY, startsOn: '2026-08-09' })).toEqual({
      dayOfMonth: null,
      dayOfWeek: 7,
    });
  });

  it('leaves both day fields null for a cadence that needs neither', () => {
    expect(anchorsFor({ frequency: RecurrenceFrequency.DAILY, startsOn: '2026-08-05' })).toEqual({
      dayOfMonth: null,
      dayOfWeek: null,
    });
  });
});

describe('stopping conditions', () => {
  it('pays once and never again for a one-off', () => {
    const rule = schedule({ frequency: RecurrenceFrequency.ONCE, dayOfMonth: null });

    expect(firstRunOn(rule)).toBe('2026-01-31');
    expect(nextRunOn(rule, { after: '2026-01-31', occurrencesRun: 1 })).toBeNull();
  });

  it('stops at the end date rather than paying past it', () => {
    const rule = schedule({ endsOn: '2026-03-01' });

    expect(nextRunOn(rule, { after: '2026-01-31', occurrencesRun: 1 })).toBe('2026-02-28');
    expect(nextRunOn(rule, { after: '2026-02-28', occurrencesRun: 2 })).toBeNull();
  });

  it('stops once the payment cap has been reached', () => {
    const rule = schedule({ maxOccurrences: 3 });

    expect(nextRunOn(rule, { after: '2026-03-31', occurrencesRun: 2 })).toBe('2026-04-30');
    expect(nextRunOn(rule, { after: '2026-03-31', occurrencesRun: 3 })).toBeNull();
  });

  it('describes no payment at all when the window excludes every date', () => {
    const rule = schedule({ dayOfMonth: 15, startsOn: '2026-01-20', endsOn: '2026-02-01' });

    expect(firstRunOn(rule)).toBeNull();
  });
});
