import { type BankLocation } from '@reliance/contracts';

/**
 * Shared shapes for the branch and ATM directory.
 *
 * Opening hours are built rather than typed out: a seven-day schedule written by hand
 * twenty times is twenty chances to close a branch on the wrong day, and the three
 * patterns below are what the estate actually runs.
 */

type OpeningHours = BankLocation['openingHours'][number];
type Day = OpeningHours['day'];

/**
 * Coordinates are supplied in whole microdegrees and divided here.
 *
 * A fractional literal is a lint error across `apps/api/src` — the rule exists to keep
 * floats away from money and is deliberately blunt. Integer microdegrees sidestep it and
 * are the better representation anyway: 10^-6 degrees is about 11cm, exactly, with no
 * decimal string to misread.
 */
export function degrees(microdegrees: number): number {
  return microdegrees / MICRODEGREES_PER_DEGREE;
}

const MICRODEGREES_PER_DEGREE = 1_000_000;

/** One day's trading window. Both fields null means closed. */
interface DayHours {
  opens: string | null;
  closes: string | null;
}

const CLOSED: DayHours = { opens: null, closes: null };

const WEEKDAYS: readonly Day[] = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

function schedule(options: {
  weekday: DayHours;
  saturday: DayHours;
  sunday: DayHours;
}): OpeningHours[] {
  return [
    ...WEEKDAYS.map((day) => ({ day, ...options.weekday })),
    { day: 'SAT' as const, ...options.saturday },
    { day: 'SUN' as const, ...options.sunday },
  ];
}

/** Flagship branches: early open, late close, and a full Saturday. */
export const EXTENDED: OpeningHours[] = schedule({
  weekday: { opens: '08:30', closes: '18:00' },
  saturday: { opens: '09:00', closes: '16:00' },
  sunday: CLOSED,
});

/** The standard high-street branch. */
export const HIGH_STREET: OpeningHours[] = schedule({
  weekday: { opens: '09:30', closes: '16:30' },
  saturday: { opens: '09:30', closes: '13:00' },
  sunday: CLOSED,
});

/** A cash machine in a public space. `23:59` rather than `24:00`, which is not a time. */
export const ROUND_THE_CLOCK: OpeningHours[] = schedule({
  weekday: { opens: '00:00', closes: '23:59' },
  saturday: { opens: '00:00', closes: '23:59' },
  sunday: { opens: '00:00', closes: '23:59' },
});

/**
 * Cities with more than one site.
 *
 * Named because six London branches would otherwise repeat the same string literal six
 * times, and a typo in one of them would silently split the estate across two "cities"
 * that a proximity search would treat as unrelated.
 */
export const City = {
  LONDON: 'London',
  MANCHESTER: 'Manchester',
  BIRMINGHAM: 'Birmingham',
} as const;

/** What a customer can do in a branch. */
export const BRANCH_SERVICES: readonly string[] = Object.freeze([
  'Cash withdrawal',
  'Cash and cheque deposit',
  'Account opening',
  'Identity verification',
  'Mortgage and loan appointments',
  'Business banking',
  'Foreign currency on request',
]);

/** What a standalone cash machine offers. */
export const ATM_SERVICES: readonly string[] = Object.freeze([
  'Cash withdrawal',
  'Balance enquiry',
  'PIN change',
]);
