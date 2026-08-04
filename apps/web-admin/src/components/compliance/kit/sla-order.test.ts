/**
 * The SLA helpers, pinned to a fixed instant.
 *
 * These are the numbers a compliance team is measured on, and every one of them is a
 * function of "now" — which is exactly why nothing in the source reads the clock. Passing
 * the instant in means these assertions are true in December as well as in August, and on
 * a laptop whose timezone is wrong.
 */

import { countBreached, slaSortValue } from './sla-order';

/** 3 August 2026, 12:00:00 UTC. Every case below is relative to this. */
const NOW = Date.parse('2026-08-03T12:00:00Z');

const ONE_HOUR_AGO = '2026-08-03T11:00:00Z';
const IN_ONE_HOUR = '2026-08-03T13:00:00Z';

describe('slaSortValue', () => {
  it('orders the most urgent item first when sorted ascending', () => {
    const order = [IN_ONE_HOUR, ONE_HOUR_AGO, null]
      .map((due) => ({ due, key: slaSortValue(due) }))
      .sort((left, right) => left.key - right.key)
      .map((entry) => entry.due);

    expect(order).toEqual([ONE_HOUR_AGO, IN_ONE_HOUR, null]);
  });

  it('sorts an item with no deadline last rather than first', () => {
    expect(slaSortValue(null)).toBeGreaterThan(slaSortValue(IN_ONE_HOUR));
  });

  it('treats an unparseable instant as having no deadline', () => {
    expect(slaSortValue('not a date')).toBe(slaSortValue(null));
  });
});

describe('countBreached', () => {
  it('counts only the deadlines that have already passed', () => {
    expect(countBreached([ONE_HOUR_AGO, IN_ONE_HOUR, ONE_HOUR_AGO, null], NOW)).toBe(2);
  });

  it('counts nothing in an empty queue', () => {
    expect(countBreached([], NOW)).toBe(0);
  });

  it('does not count a deadline that falls exactly now', () => {
    expect(countBreached(['2026-08-03T12:00:00Z'], NOW)).toBe(0);
  });
});
