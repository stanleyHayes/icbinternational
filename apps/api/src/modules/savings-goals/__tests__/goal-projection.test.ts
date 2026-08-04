import { Money } from '@reliance/money';

import { AutoSaveFrequency, dueRuns, nextRunAfter } from '../auto-save-schedule.js';
import { progressBps, projectGoal, remaining } from '../goal-projection.js';
import { roundUpFor, roundUpTotal } from '../round-up.js';

/**
 * The three pieces of savings arithmetic: progress, pace and change.
 *
 * All pure, all date-driven. `dueRuns` is the one that matters most for the simulator: the
 * clock can jump a year in a single step, and an auto-save that moved one week's money in
 * response would make a year of simulated saving look like a week of it.
 */

const GBP = 'GBP';

function money(major: string): Money {
  return Money.fromMajor(major, GBP);
}

describe('progressBps', () => {
  it('is nil on an empty goal', () => {
    expect(progressBps(money('1000.00'), money('0.00'))).toBe(0);
  });

  it('is half way at half the target', () => {
    expect(progressBps(money('1000.00'), money('500.00'))).toBe(5000);
  });

  it('caps at one hundred percent when the customer overshoots', () => {
    expect(progressBps(money('1000.00'), money('1500.00'))).toBe(10_000);
  });

  it('treats a nil target as already met rather than dividing by nought', () => {
    expect(progressBps(money('0.00'), money('0.00'))).toBe(10_000);
  });
});

describe('remaining', () => {
  it('is what is left to find', () => {
    expect(remaining(money('1000.00'), money('400.00')).equals(money('600.00'))).toBe(true);
  });

  it('is nil rather than negative once the target is passed', () => {
    expect(remaining(money('1000.00'), money('1200.00')).isZero).toBe(true);
  });
});

describe('projectGoal', () => {
  const base = {
    target: money('2400.00'),
    startedOn: '2026-01-01',
    targetDate: '2027-01-01' as string | null,
    asOf: '2026-07-01',
  };

  it('suggests the contribution that clears the shortfall by the deadline', () => {
    // £1,200 short with six months to go is £200 a month.
    const projection = projectGoal({ ...base, current: money('1200.00') });

    expect(projection.suggestedMonthlyContribution?.equals(money('200.00'))).toBe(true);
  });

  it('rounds the suggestion up, so following it never lands short', () => {
    const projection = projectGoal({ ...base, current: money('1199.99') });

    expect(projection.suggestedMonthlyContribution?.equals(money('200.01'))).toBe(true);
  });

  it('suggests nothing at all when there is no deadline', () => {
    const projection = projectGoal({ ...base, targetDate: null, current: money('100.00') });

    expect(projection.suggestedMonthlyContribution).toBeNull();
    expect(projection.onTrack).toBe(true);
  });

  it('calls a goal on track when the pace so far will get there', () => {
    // Half saved in half the time.
    const projection = projectGoal({ ...base, current: money('1200.00') });

    expect(projection.onTrack).toBe(true);
  });

  it('calls a goal behind when the pace so far will not', () => {
    const projection = projectGoal({ ...base, current: money('200.00') });

    expect(projection.onTrack).toBe(false);
  });

  it('is never on track past its deadline and short of its target', () => {
    const projection = projectGoal({ ...base, asOf: '2027-06-01', current: money('2000.00') });

    expect(projection.onTrack).toBe(false);
  });

  it('is complete, on track and owed nothing once the target is met', () => {
    const projection = projectGoal({ ...base, current: money('2400.00') });

    expect(projection.complete).toBe(true);
    expect(projection.onTrack).toBe(true);
    expect(projection.shortfall.isZero).toBe(true);
    expect(projection.suggestedMonthlyContribution?.isZero).toBe(true);
  });

  it('asks for the whole shortfall when the deadline is today', () => {
    const projection = projectGoal({ ...base, asOf: '2027-01-01', current: money('2000.00') });

    expect(projection.suggestedMonthlyContribution?.equals(money('400.00'))).toBe(true);
  });
});

describe('roundUpFor', () => {
  const cases: [string, string][] = [
    ['3.40', '0.60'],
    ['3.99', '0.01'],
    ['3.01', '0.99'],
    ['3.00', '0.00'],
    ['0.50', '0.50'],
    ['127.65', '0.35'],
  ];

  it.each(cases)('rounds a £%s purchase up by £%s', (spend, change) => {
    expect(roundUpFor(money(spend)).equals(money(change))).toBe(true);
  });

  it('rounds nothing up on a refund', () => {
    expect(roundUpFor(money('-4.50')).isZero).toBe(true);
  });

  it('sums per purchase rather than on the total, as the customer is told', () => {
    const spends = [money('1.50'), money('1.50'), money('1.50')];

    // Three fifty-pence round-ups, not the fifty pence a £4.50 total would give.
    expect(roundUpTotal(spends, GBP).equals(money('1.50'))).toBe(true);
  });

  it('is nil for an empty batch', () => {
    expect(roundUpTotal([], GBP).isZero).toBe(true);
  });
});

describe('nextRunAfter', () => {
  it('advances a daily save by a day', () => {
    expect(nextRunAfter('2026-03-31', AutoSaveFrequency.DAILY)).toBe('2026-04-01');
  });

  it('advances a weekly save by a week', () => {
    expect(nextRunAfter('2026-03-26', AutoSaveFrequency.WEEKLY)).toBe('2026-04-02');
  });

  it('advances a monthly save by a month, clamping at a short month end', () => {
    expect(nextRunAfter('2026-01-31', AutoSaveFrequency.MONTHLY)).toBe('2026-02-28');
  });
});

describe('dueRuns', () => {
  it('finds nothing before the first run date', () => {
    const runs = dueRuns({
      nextRunOn: '2026-04-01',
      asOf: '2026-03-20',
      frequency: AutoSaveFrequency.MONTHLY,
      cap: 12,
    });

    expect(runs).toEqual([]);
  });

  it('finds the run due today', () => {
    const runs = dueRuns({
      nextRunOn: '2026-04-01',
      asOf: '2026-04-01',
      frequency: AutoSaveFrequency.MONTHLY,
      cap: 12,
    });

    expect(runs).toEqual(['2026-04-01']);
  });

  it('catches up every occurrence the clock jumped over', () => {
    const runs = dueRuns({
      nextRunOn: '2026-01-15',
      asOf: '2026-06-15',
      frequency: AutoSaveFrequency.MONTHLY,
      cap: 24,
    });

    expect(runs).toHaveLength(6);
  });

  it('catches up a year of weekly saves when the clock advances a year', () => {
    const runs = dueRuns({
      nextRunOn: '2026-01-01',
      asOf: '2026-12-31',
      frequency: AutoSaveFrequency.WEEKLY,
      cap: 120,
    });

    expect(runs).toHaveLength(53);
  });

  it('stops at the cap rather than running away over a decade', () => {
    const runs = dueRuns({
      nextRunOn: '2020-01-01',
      asOf: '2030-01-01',
      frequency: AutoSaveFrequency.DAILY,
      cap: 30,
    });

    expect(runs).toHaveLength(30);
  });
});
