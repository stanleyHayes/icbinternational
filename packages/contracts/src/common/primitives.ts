/**
 * Primitive schemas every module builds on.
 *
 * Defined once here so that "an amount", "an identifier" or "a timestamp" means exactly
 * the same thing in the API, in the client dashboard's form validation, and in the admin
 * console. One definition, three consumers.
 */

import { z } from 'zod';

import { CURRENCY_CODES } from '@reliance/money';

// --- Identifiers ----------------------------------------------------------

/** Prefixed ULID, e.g. `acc_01JQ8Z…`. Public identifiers never expose Mongo ObjectIds. */
export const PREFIXED_ID_PATTERN = /^[a-z]{2,5}_[0-9A-HJKMNP-TV-Z]{26}$/;

export const idSchema = z.string().regex(PREFIXED_ID_PATTERN, 'must be a prefixed ULID');

/** Builds an id schema constrained to one entity prefix, e.g. `entityId('acc')`. */
export function entityId(prefix: string) {
  return z
    .string()
    .regex(new RegExp(`^${prefix}_[0-9A-HJKMNP-TV-Z]{26}$`), `must be a ${prefix}_ identifier`);
}

/** Prefixes used across the system. Keep in sync with the API's `IdGenerator`. */
export const ID_PREFIX = {
  user: 'usr',
  session: 'ses',
  device: 'dev',
  account: 'acc',
  ledgerAccount: 'gla',
  journalEntry: 'jnl',
  transaction: 'txn',
  hold: 'hld',
  transfer: 'trf',
  transferOrder: 'tro',
  beneficiary: 'ben',
  card: 'crd',
  authorisation: 'aut',
  loan: 'loa',
  deposit: 'dep',
  goal: 'gol',
  quote: 'qte',
  document: 'doc',
  statement: 'stm',
  notification: 'ntf',
  ticket: 'tkt',
  dispute: 'dsp',
  alert: 'alt',
  case: 'cse',
  product: 'prd',
  kycCase: 'kyc',
  adminUser: 'adm',
  budget: 'bdg',
  auditEvent: 'aud',
  // Added after four lanes reported minting a borrowed prefix. A `tro_` on a mandate or a
  // `qte_` on a loan application is harmless until someone greps a log for the wrong thing.
  loanApplication: 'lap',
  billPayment: 'bil',
  paymentRequest: 'prq',
  mandate: 'mdt',
} as const;

// --- Time -----------------------------------------------------------------

/** ISO-8601 UTC instant. The wire format for every timestamp, without exception. */
export const isoDateTimeSchema = z.iso.datetime({ offset: false });

/** Calendar date with no time component, e.g. a value date or date of birth. */
export const isoDateSchema = z.iso.date();

// --- Money ----------------------------------------------------------------

export const currencyCodeSchema = z.enum(CURRENCY_CODES);

/**
 * A monetary amount on the wire: minor units as a decimal string plus a currency.
 *
 * Minor units travel as a string because JSON numbers are IEEE-754 doubles and a large
 * balance would lose precision in transit. The client parses it straight into a `Money`.
 */
export const moneySchema = z.object({
  amount: z.string().regex(/^-?\d+$/, 'must be an integer string of minor units'),
  currency: currencyCodeSchema,
});

/** A positive amount — used wherever a debit or credit must move real value. */
export const positiveMoneySchema = moneySchema.extend({
  amount: z.string().regex(/^\d+$/, 'must be a positive integer string of minor units'),
});

/** Major-unit amount as typed by a human, e.g. `"1,234.56"`. Parsed server-side. */
export const majorAmountSchema = z
  .string()
  .regex(/^\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^\d+(?:\.\d+)?$/, 'must be a decimal amount');

/** Rate quoted as a decimal string, e.g. `"1.0845"`. Never a float. */
export const rateSchema = z.string().regex(/^\d+(?:\.\d+)?$/, 'must be a positive decimal');

/** Basis points — 25 bps is 0.25%. Integer only. */
export const basisPointsSchema = z.number().int().min(0).max(10_000);

// --- Contact & identity ---------------------------------------------------

export const emailSchema = z.email().max(254).toLowerCase().trim();

/** E.164, e.g. `+447700900123`. Stored and compared in this form only. */
export const phoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/, 'must be an E.164 phone number');

export const countryCodeSchema = z
  .string()
  .length(2)
  .regex(/^[A-Z]{2}$/, 'ISO 3166-1 alpha-2');

export const localeSchema = z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'BCP 47 language tag');

/**
 * Password policy. Length does more for entropy than symbol classes do, so the floor is
 * high and the composition rules are deliberately light.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH)
  .regex(/[a-z]/, 'must contain a lowercase letter')
  .regex(/[A-Z]/, 'must contain an uppercase letter')
  .regex(/\d/, 'must contain a digit');

/** Six-digit TOTP or SMS code. */
export const otpSchema = z.string().regex(/^\d{6}$/, 'must be a 6-digit code');

/** Four-digit card or transaction PIN. */
export const pinSchema = z.string().regex(/^\d{4}$/, 'must be a 4-digit PIN');

// --- Banking identifiers --------------------------------------------------

/** Reliance internal account number: 10 digits. */
export const accountNumberSchema = z.string().regex(/^\d{10}$/, 'must be 10 digits');

/** Sort code / routing number: 6 digits, grouped for display as `00-00-00`. */
export const sortCodeSchema = z.string().regex(/^\d{6}$/, 'must be 6 digits');

/** IBAN, upper-case and unspaced. Checksum is validated server-side, not here. */
export const ibanSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/, 'must be a valid IBAN format');

/** SWIFT/BIC, 8 or 11 characters. */
export const bicSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/, 'must be a valid BIC');

/** Last four digits of a card. The full PAN never appears in any contract. */
export const last4Schema = z.string().regex(/^\d{4}$/);

/** ISO 18245 merchant category code. */
export const mccSchema = z.string().regex(/^\d{4}$/);

// --- Free text ------------------------------------------------------------

export const shortTextSchema = z.string().trim().min(1).max(120);
export const mediumTextSchema = z.string().trim().min(1).max(500);
export const longTextSchema = z.string().trim().min(1).max(5000);

/** Payment reference / narrative shown on both sides of a transfer. */
export const referenceSchema = z
  .string()
  .trim()
  .max(140)
  .regex(/^[\w\s\-.,/&'()+#:]*$/, 'contains characters the clearing rails cannot carry');

/** Free-form key/value metadata attached to a request and echoed back untouched. */
export const metadataSchema = z.record(z.string().max(64), z.string().max(512)).optional();

export type Money = z.infer<typeof moneySchema>;
export type IsoDateTime = z.infer<typeof isoDateTimeSchema>;
export type IsoDate = z.infer<typeof isoDateSchema>;
