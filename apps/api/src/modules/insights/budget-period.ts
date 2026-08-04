import { type Period } from './period.js';

/**
 * The calendar month containing `at`, in UTC.
 *
 * Budgets run on calendar months rather than rolling 30-day windows because that is what
 * a person means by "my monthly budget": it resets when the month does, in step with the
 * salary and the direct debits, not on a date that drifts.
 *
 * UTC rather than the customer's display timezone. Every `bookedAt` in the ledger is UTC,
 * so a boundary computed anywhere else would put a transaction booked at 23:30 on the
 * 31st into the wrong month — and the spend total would then disagree with the
 * transaction list the customer is comparing it against.
 */
export function currentMonth(at: Date): Period {
  const year = at.getUTCFullYear();
  const month = at.getUTCMonth();

  return {
    from: new Date(Date.UTC(year, month, 1)),
    // One millisecond before the next month begins, so the window is inclusive at both
    // ends and no transaction can fall between two consecutive months.
    to: new Date(Date.UTC(year, month + 1, 1) - 1),
  };
}
