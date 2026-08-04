/**
 * Fixed vocabulary of the simulator kernel: reason codes, reference alphabets and the
 * default settlement schedules.
 *
 * The schedules are what make the three rails feel like themselves rather than three
 * spellings of the same pipe. ACH is a batch network with several windows a day and
 * next-day value; RTGS is effectively continuous within operating hours and settles
 * same-day; SWIFT closes once a day and value lands two business days later, after the
 * correspondent chain has done its work.
 */

import { PaymentRailName } from '../ports/payment-rail.types.js';

import { type RailSchedule } from './rail-schedule.js';

/** Length of the random segment of a rail reference. */
export const RAIL_REFERENCE_LENGTH = 10;

/**
 * Alphabet for rail references: no `0/O`, `1/I`, so a reference read over the phone to
 * a support agent cannot be mis-transcribed.
 */
export const RAIL_REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Reason codes a rail cites when it refuses an instruction or returns a payment,
 * modelled on the ACH return-code catalogue the real networks publish. `retryable`
 * marks the codes a bare retry can overcome — an R01 can succeed once funds arrive;
 * a closed account never will.
 */
export const RAIL_REASON_CODES: readonly {
  code: string;
  description: string;
  retryable: boolean;
}[] = Object.freeze([
  { code: 'R01', description: 'Insufficient funds in the beneficiary account', retryable: true },
  { code: 'R02', description: 'Beneficiary account closed', retryable: false },
  {
    code: 'R03',
    description: 'No account on file; unable to locate the beneficiary',
    retryable: false,
  },
  { code: 'R04', description: 'Invalid beneficiary account number', retryable: false },
  { code: 'R07', description: 'Authorisation revoked by the account holder', retryable: false },
  { code: 'R10', description: 'Customer advises the payment was not authorised', retryable: false },
]);

/** Reason code cited when the network itself does not answer. Not in the R-catalogue. */
export const OUTAGE_REASON_CODE = 'OUTAGE';

/**
 * Default settlement schedules per rail. Lanes with their own calendar (a corridor
 * whose SWIFT cut-off is earlier) pass overrides to the kernel constructor rather than
 * editing this table.
 */
export const DEFAULT_RAIL_SCHEDULES: Readonly<Record<PaymentRailName, RailSchedule>> =
  Object.freeze({
    [PaymentRailName.ACH]: Object.freeze({
      rail: PaymentRailName.ACH,
      windows: Object.freeze([
        Object.freeze({ hourUtc: 10, minuteUtc: 30 }),
        Object.freeze({ hourUtc: 14, minuteUtc: 30 }),
        Object.freeze({ hourUtc: 16, minuteUtc: 30 }),
      ]),
      valueDateLagBusinessDays: 1,
    }),
    [PaymentRailName.RTGS]: Object.freeze({
      rail: PaymentRailName.RTGS,
      // Hourly windows 06:00–18:00 UTC model a continuous system inside operating hours:
      // the longest a payment waits for "the next cycle" is one hour.
      windows: Object.freeze([
        Object.freeze({ hourUtc: 6, minuteUtc: 0 }),
        Object.freeze({ hourUtc: 7, minuteUtc: 0 }),
        Object.freeze({ hourUtc: 8, minuteUtc: 0 }),
        Object.freeze({ hourUtc: 9, minuteUtc: 0 }),
        Object.freeze({ hourUtc: 10, minuteUtc: 0 }),
        Object.freeze({ hourUtc: 11, minuteUtc: 0 }),
        Object.freeze({ hourUtc: 12, minuteUtc: 0 }),
        Object.freeze({ hourUtc: 13, minuteUtc: 0 }),
        Object.freeze({ hourUtc: 14, minuteUtc: 0 }),
        Object.freeze({ hourUtc: 15, minuteUtc: 0 }),
        Object.freeze({ hourUtc: 16, minuteUtc: 0 }),
        Object.freeze({ hourUtc: 17, minuteUtc: 0 }),
        Object.freeze({ hourUtc: 18, minuteUtc: 0 }),
      ]),
      valueDateLagBusinessDays: 0,
    }),
    [PaymentRailName.SWIFT]: Object.freeze({
      rail: PaymentRailName.SWIFT,
      windows: Object.freeze([Object.freeze({ hourUtc: 17, minuteUtc: 0 })]),
      valueDateLagBusinessDays: 2,
    }),
  });
