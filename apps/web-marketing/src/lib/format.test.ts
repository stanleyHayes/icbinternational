// TypeScript 7 does not pick `@types/jest` up from the automatic `@types` scan under
// this workspace's pnpm layout, and `tsconfig.json` is shared configuration this app
// does not own. The reference is the narrowest fix and affects type checking only.
/// <reference types="jest" />

import {
  formatAer,
  formatBps,
  formatDate,
  formatDistance,
  formatShortDate,
  formatTerm,
} from './format';

describe('formatBps', () => {
  it('drops the decimal point on a whole percentage', () => {
    expect(formatBps(400)).toBe('4%');
    expect(formatBps(0)).toBe('0%');
  });

  it('keeps two places when both are significant', () => {
    expect(formatBps(425)).toBe('4.25%');
    expect(formatBps(899)).toBe('8.99%');
    expect(formatBps(3990)).toBe('39.9%');
  });

  it('drops only the trailing zero, never a leading one', () => {
    expect(formatBps(450)).toBe('4.5%');
    expect(formatBps(405)).toBe('4.05%');
  });

  it('never produces a floating-point artefact', () => {
    // 4.25 survives a float round-trip; 8.15 famously does not. Both must be exact here.
    expect(formatBps(815)).toBe('8.15%');
    expect(formatBps(1015)).toBe('10.15%');
  });
});

describe('formatAer', () => {
  it('labels the rate the way a savings product must be quoted', () => {
    expect(formatAer(425)).toBe('4.25% AER');
  });
});

describe('formatDate', () => {
  it('renders in UTC so the server and the browser agree', () => {
    // 23:30 UTC is the next day in Sydney and the same day in London. Fixing the zone is
    // what stops React replacing the text after hydration.
    expect(formatDate('2026-08-03T23:30:00.000Z')).toBe('3 August 2026');
  });

  it('accepts a bare ISO date', () => {
    expect(formatDate('2026-01-01')).toBe('1 January 2026');
  });

  it('abbreviates for lists', () => {
    expect(formatShortDate('2026-06-18')).toBe('18 Jun 2026');
  });
});

describe('formatDistance', () => {
  it('uses metres below a kilometre', () => {
    expect(formatDistance(450)).toBe('450 m');
    expect(formatDistance(949)).toBe('949 m');
  });

  it('switches to kilometres at the threshold', () => {
    expect(formatDistance(950)).toBe('1 km');
    expect(formatDistance(2340)).toBe('2.3 km');
  });

  it('drops a trailing zero tenth', () => {
    expect(formatDistance(4000)).toBe('4 km');
  });
});

describe('formatTerm', () => {
  it('counts in months below a year', () => {
    expect(formatTerm(6)).toBe('6 months');
  });

  it('counts in years once there is one', () => {
    expect(formatTerm(12)).toBe('1 year');
    expect(formatTerm(60)).toBe('5 years');
  });

  it('names the remainder', () => {
    expect(formatTerm(18)).toBe('1 year 6 months');
    expect(formatTerm(30)).toBe('2 years 6 months');
  });
});
