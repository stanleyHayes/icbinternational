/**
 * IBAN construction and validation — ISO 13616 with ISO 7064 MOD 97-10 check digits.
 *
 * Framework-free and dependency-free so the checksum can be tested exhaustively against
 * the published reference IBANs in milliseconds. The arithmetic is done one digit at a
 * time rather than by building a 30-digit `BigInt`: the remainder never exceeds three
 * digits, so the whole computation stays in safe integer range and costs one pass.
 *
 * An IBAN whose check digits are wrong is worse than no IBAN at all — it looks payable,
 * gets keyed into a counterparty's payment file, and fails at the far end after the
 * customer has been told the money is on its way.
 */

/** ISO 7064 modulus for MOD 97-10. */
const MODULUS = 97;

/** Check digits are `98 − (rearranged mod 97)`, giving a value in 02–98. */
const CHECK_COMPLEMENT = 98;

/** A valid IBAN's rearranged form is congruent to 1, by construction. */
const VALID_REMAINDER = 1;

/** Country code plus check digits — the prefix moved to the end before the modulus. */
const PREFIX_LENGTH = 4;

const RADIX = 10;
const ZERO_CODE = '0'.charCodeAt(0);
const NINE_CODE = '9'.charCodeAt(0);
const UPPER_A_CODE = 'A'.charCodeAt(0);
const UPPER_Z_CODE = 'Z'.charCodeAt(0);

/** `A` maps to 10, `B` to 11, … `Z` to 35. */
const LETTER_BASE = 10;

/** Placeholder check digits used while computing the real ones. */
const CHECK_PLACEHOLDER = '00';

/** Shortest and longest IBAN the ISO registry allows. */
const MIN_LENGTH = 15;
const MAX_LENGTH = 34;

const IBAN_SHAPE = /^[A-Z]{2}\d{2}[A-Z\d]+$/;

/**
 * The check digits for a country code and BBAN, as a zero-padded two-character string.
 *
 * @param countryCode ISO 3166-1 alpha-2, upper case.
 * @param bban The national part, upper case and unspaced.
 */
export function ibanCheckDigits(countryCode: string, bban: string): string {
  const remainder = mod97(`${bban}${countryCode}${CHECK_PLACEHOLDER}`);
  return String(CHECK_COMPLEMENT - remainder).padStart(CHECK_PLACEHOLDER.length, '0');
}

/** Assembles a complete IBAN, computing its check digits. */
export function buildIban(input: { countryCode: string; bban: string }): string {
  const countryCode = input.countryCode.toUpperCase();
  const bban = input.bban.toUpperCase();
  return `${countryCode}${ibanCheckDigits(countryCode, bban)}${bban}`;
}

/**
 * Whether a string is a structurally sound IBAN with correct check digits.
 *
 * Does not consult the country registry: length and BBAN layout vary per country and the
 * registry is a moving target. What this proves is that the value is self-consistent —
 * which is the property a transposed or mistyped digit breaks.
 */
export function isValidIban(value: string): boolean {
  const candidate = normaliseIban(value);

  if (candidate.length < MIN_LENGTH || candidate.length > MAX_LENGTH) return false;
  if (!IBAN_SHAPE.test(candidate)) return false;

  return mod97(rearrange(candidate)) === VALID_REMAINDER;
}

/** Strips spaces and upper-cases, the form every comparison and index uses. */
export function normaliseIban(value: string): string {
  return value.replaceAll(/\s+/g, '').toUpperCase();
}

/** Moves the four leading characters to the end, as ISO 13616 requires before the modulus. */
function rearrange(iban: string): string {
  return `${iban.slice(PREFIX_LENGTH)}${iban.slice(0, PREFIX_LENGTH)}`;
}

/**
 * MOD 97-10 over an alphanumeric string, letters expanded to their two-digit values.
 *
 * @throws {RangeError} on any character that is neither `0-9` nor `A-Z`.
 */
export function mod97(value: string): number {
  let remainder = 0;

  for (const character of value) {
    remainder = accumulate(remainder, character);
  }

  return remainder;
}

/** Folds one character — one digit, or two for a letter — into the running remainder. */
function accumulate(remainder: number, character: string): number {
  const code = character.charCodeAt(0);

  if (code >= ZERO_CODE && code <= NINE_CODE) {
    return (remainder * RADIX + (code - ZERO_CODE)) % MODULUS;
  }

  if (code >= UPPER_A_CODE && code <= UPPER_Z_CODE) {
    const expanded = code - UPPER_A_CODE + LETTER_BASE;
    const tens = (remainder * RADIX + Math.floor(expanded / RADIX)) % MODULUS;
    return (tens * RADIX + (expanded % RADIX)) % MODULUS;
  }

  throw new RangeError(`Character ${character} cannot appear in an IBAN`);
}

/**
 * ISO 7064 MOD 97-10 check digits for a purely numeric domestic identifier.
 *
 * Used for the two digits appended to an account number's serial. Shares the modulus and
 * the complement with the IBAN because they are the same standard, applied nationally
 * rather than internationally.
 */
export function domesticCheckDigits(digits: string): string {
  const remainder = mod97(`${digits}${CHECK_PLACEHOLDER}`);
  return String(CHECK_COMPLEMENT - remainder).padStart(CHECK_PLACEHOLDER.length, '0');
}

/** Whether a numeric identifier's trailing two digits are its correct domestic check. */
export function hasValidDomesticCheck(value: string): boolean {
  const body = value.slice(0, -CHECK_PLACEHOLDER.length);
  const check = value.slice(-CHECK_PLACEHOLDER.length);
  return body.length > 0 && domesticCheckDigits(body) === check;
}
