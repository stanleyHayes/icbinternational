import {
  MASK_CHARACTER,
  MASK_VISIBLE_SUFFIX,
  MAX_VALUE_LENGTH,
  REDACTED_PLACEHOLDER,
} from './audit.constants.js';
import { type AuditChange } from './audit.types.js';

/**
 * What may be written into the audit trail, and in what form.
 *
 * The audit log is the one collection nobody may delete from, which makes it the worst
 * possible place for a secret: a leaked password hash or card number recorded here is
 * permanent by design. So redaction happens on the write path, before the value reaches
 * the hasher — a value that was never stored cannot leak, and a later "clean-up" would
 * break the chain anyway.
 *
 * Three dispositions:
 *
 * - **DENY** — the value is a credential. It is replaced wholesale; not even its length
 *   survives, because length is a hint.
 * - **MASK** — the value identifies a payment instrument or a person. The last four
 *   characters survive so an investigator can still tell two cards apart, which is the
 *   entire operational reason to record it.
 * - **ALLOW** — recorded verbatim, truncated to a sane ceiling.
 *
 * Monetary amounts are deliberately **not** redacted. An audit row exists to answer "who
 * changed this limit from what to what"; masking the numbers would leave a record that
 * satisfies a checkbox and no auditor. Card and account numbers are masked instead — the
 * payment data is the sensitive part, not the amount.
 */
export type FieldDisposition = 'ALLOW' | 'MASK' | 'DENY';

/**
 * Field name tokens that always mean a credential.
 *
 * Matched as whole tokens rather than substrings on purpose: `shippingAddress` contains
 * "pin" and `tokenised` contains "token", and redacting either would quietly destroy
 * evidence while looking like diligence.
 */
const DENIED_TOKENS = new Set([
  'auth',
  'authorization',
  'bearer',
  'cookie',
  'credential',
  'credentials',
  'csc',
  'cvc',
  'cvv',
  'hotp',
  'jwt',
  'mfa',
  'otp',
  'passcode',
  'passphrase',
  'passwd',
  'password',
  'pin',
  'salt',
  'secret',
  'secrets',
  'sig',
  'signature',
  'token',
  'tokens',
  'totp',
]);

/** Compound names that only read as a credential once the separators are removed. */
const DENIED_PHRASES = [
  'accesstoken',
  'apikey',
  'backupcode',
  'clientsecret',
  'privatekey',
  'recoverycode',
  'refreshtoken',
  'secretkey',
  'sessionid',
];

/** Tokens naming a payment instrument or a natural-person identifier. */
const MASKED_TOKENS = new Set(['iban', 'msisdn', 'nino', 'pan', 'phone', 'ssn']);

const MASKED_PHRASES = [
  'accountnumber',
  'cardnumber',
  'mobilenumber',
  'nationalid',
  'phonenumber',
  'routingnumber',
  'sortcode',
  'taxid',
];

/** A bare JWT or opaque bearer credential, whatever the field happens to be called. */
const JWT_PATTERN = /^[\w-]+\.[\w-]+\.[\w-]+$/;

const PAN_MIN_DIGITS = 13;
const PAN_MAX_DIGITS = 19;
const PAN_CANDIDATE_PATTERN = new RegExp(`^\\d{${PAN_MIN_DIGITS},${PAN_MAX_DIGITS}}$`);
const PAN_SEPARATORS = /[\s-]/g;

/** Splits `profile.totpSecret` into `['profile', 'totp', 'secret']`. */
function tokenise(field: string): string[] {
  return field
    .split(/[\s.[\]_-]+/)
    .flatMap((part) => part.split(/(?=[A-Z])/))
    .map((token) => token.toLowerCase())
    .filter((token) => token.length > 0);
}

/** Decides how a field's value may be recorded. */
export function classifyField(field: string): FieldDisposition {
  const tokens = tokenise(field);
  const joined = tokens.join('');

  if (tokens.some((token) => DENIED_TOKENS.has(token))) return 'DENY';
  if (DENIED_PHRASES.some((phrase) => joined.includes(phrase))) return 'DENY';
  if (tokens.some((token) => MASKED_TOKENS.has(token))) return 'MASK';
  if (MASKED_PHRASES.some((phrase) => joined.includes(phrase))) return 'MASK';

  return 'ALLOW';
}

/** Keeps the trailing characters and replaces everything before them. */
function mask(value: string): string {
  if (value.length <= MASK_VISIBLE_SUFFIX) return MASK_CHARACTER.repeat(value.length);
  const suffix = value.slice(-MASK_VISIBLE_SUFFIX);
  return MASK_CHARACTER.repeat(value.length - MASK_VISIBLE_SUFFIX) + suffix;
}

/** Luhn check digit — the cheapest reliable way to tell a PAN from any other long number. */
function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;

  for (const character of [...digits].reverse()) {
    const digit = Number(character);
    sum += double ? doubled(digit) : digit;
    double = !double;
  }

  return sum % LUHN_MODULUS === 0;
}

function doubled(digit: number): number {
  const product = digit * 2;
  return product > MAX_SINGLE_DIGIT ? product - MAX_SINGLE_DIGIT : product;
}

const LUHN_MODULUS = 10;
const MAX_SINGLE_DIGIT = 9;

/** True when the value itself looks like a card number, whatever the field is named. */
function looksLikePan(value: string): boolean {
  const digits = value.replaceAll(PAN_SEPARATORS, '');
  return PAN_CANDIDATE_PATTERN.test(digits) && passesLuhn(digits);
}

/**
 * Applies the policy to one value.
 *
 * Value-level checks run even on ALLOW fields: a PAN pasted into a `reference` and a JWT
 * assigned to `value` are exactly the accidents a field-name deny list cannot catch.
 */
export function redactValue(field: string, value: string | null): string | null {
  if (value === null || value.length === 0) return value;

  const disposition = classifyField(field);
  if (disposition === 'DENY') return REDACTED_PLACEHOLDER;
  if (disposition === 'MASK') return mask(truncate(value));
  if (JWT_PATTERN.test(value)) return REDACTED_PLACEHOLDER;
  if (looksLikePan(value)) return mask(value.replaceAll(PAN_SEPARATORS, ''));

  return truncate(value);
}

function truncate(value: string): string {
  return value.length <= MAX_VALUE_LENGTH ? value : `${value.slice(0, MAX_VALUE_LENGTH)}…`;
}

/**
 * Redacts a whole diff.
 *
 * `allowFields` switches the policy from deny-list to allow-list. Use it on entities whose
 * shape is mostly personal data — a KYC profile, say — where enumerating what is safe to
 * keep is far more defensible than trying to enumerate what is not.
 */
export function redactChanges(
  changes: readonly AuditChange[],
  options: { allowFields?: readonly string[] } = {},
): AuditChange[] {
  const allowed = options.allowFields ? new Set(options.allowFields) : null;

  return changes
    .filter((change) => allowed === null || allowed.has(change.field))
    .map((change) => ({
      field: change.field,
      before: redactValue(change.field, change.before),
      after: redactValue(change.field, change.after),
    }));
}
