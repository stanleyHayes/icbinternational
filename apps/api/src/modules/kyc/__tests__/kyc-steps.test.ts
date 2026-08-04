import {
  addMonthsUtc,
  isAtLeastAge,
  isEditable,
  nextStepFor,
  readyForSubmission,
  withStepCompleted,
  WORKFLOW_STEPS,
  yearsBetween,
} from '../domain/kyc-steps.js';

/**
 * The step machine and the calendar arithmetic, pinned with dates on both sides of
 * every boundary: the birthday that falls today, the month that is shorter than the
 * day being added.
 */

describe('the wizard step machine', () => {
  it('walks the steps in order as answers arrive', () => {
    expect(nextStepFor([])).toBe('IDENTITY');
    expect(nextStepFor(['IDENTITY'])).toBe('ADDRESS');
    expect(nextStepFor(['IDENTITY', 'ADDRESS'])).toBe('EMPLOYMENT');
  });

  it('answers REVIEW once every workflow step is complete', () => {
    expect(nextStepFor(WORKFLOW_STEPS)).toBe('REVIEW');
  });

  it('skips completed steps regardless of the order they were answered in', () => {
    expect(nextStepFor(['ADDRESS'])).toBe('IDENTITY');
    expect(nextStepFor(['IDENTITY', 'EMPLOYMENT'])).toBe('ADDRESS');
  });

  it('is ready for submission only when every workflow step is complete', () => {
    expect(readyForSubmission(WORKFLOW_STEPS)).toBe(true);
    expect(readyForSubmission(WORKFLOW_STEPS.slice(0, -1))).toBe(false);
    expect(readyForSubmission([])).toBe(false);
  });

  it('completes a step idempotently', () => {
    const once = withStepCompleted([], 'IDENTITY');
    const twice = withStepCompleted(once, 'IDENTITY');
    expect(twice).toEqual(['IDENTITY']);
  });

  it('accepts edits only while the case is with the customer', () => {
    expect(isEditable('IN_PROGRESS')).toBe(true);
    expect(isEditable('MORE_INFO_REQUIRED')).toBe(true);
    expect(isEditable('SUBMITTED')).toBe(false);
    expect(isEditable('UNDER_REVIEW')).toBe(false);
    expect(isEditable('APPROVED')).toBe(false);
    expect(isEditable('EXPIRED')).toBe(false);
  });
});

describe('calendar arithmetic', () => {
  it('counts a birthday that falls today as reached', () => {
    expect(yearsBetween('1990-06-15', '2026-06-15')).toBe(36);
    expect(isAtLeastAge('1990-06-15', '2026-06-15', 36)).toBe(true);
  });

  it('does not count a birthday that falls tomorrow', () => {
    expect(yearsBetween('1990-06-16', '2026-06-15')).toBe(35);
    expect(isAtLeastAge('2008-06-16', '2026-06-15', 18)).toBe(false);
  });

  it('refuses a seventeen-year-old and admits an eighteen-year-old', () => {
    expect(isAtLeastAge('2008-01-01', '2026-01-01', 18)).toBe(true);
    expect(isAtLeastAge('2009-01-01', '2026-01-01', 18)).toBe(false);
  });

  it('adds months across a year boundary', () => {
    expect(addMonthsUtc(new Date('2026-08-03T10:00:00Z'), 24).toISOString()).toBe(
      '2028-08-03T10:00:00.000Z',
    );
  });

  it('clamps to the target month rather than drifting into the next', () => {
    // 31 January plus one month is the last day of February, never early March.
    expect(addMonthsUtc(new Date('2027-01-31T09:00:00Z'), 1).toISOString()).toBe(
      '2027-02-28T09:00:00.000Z',
    );
    expect(addMonthsUtc(new Date('2028-01-31T09:00:00Z'), 1).toISOString()).toBe(
      '2028-02-29T09:00:00.000Z',
    );
  });
});
