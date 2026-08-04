/**
 * Countries, for the address and nationality fields.
 *
 * Codes only; the names come from `Intl.DisplayNames`, so they are spelled the way the customer's
 * own locale spells them and this file never becomes a place where somebody has to argue about a
 * country's name in English.
 *
 * The list is the set the bank onboards from. It is deliberately not "every ISO code": offering a
 * country we cannot open an account for produces a rejection three screens later, which is worse
 * than not offering it.
 */

const SUPPORTED =
  'GB IE FR DE ES IT NL BE LU PT AT DK SE NO FI IS PL CZ SK HU RO BG HR SI EE LV LT GR CY MT ' +
  'CH LI US CA AU NZ SG HK JP KR AE QA KW BH OM SA ZA NG GH KE TZ UG RW MU IN PK BD LK MY TH ' +
  'PH ID VN BR MX AR CL CO PE UY';

/** A country as a form control needs it. */
export interface Country {
  readonly value: string;
  readonly label: string;
}

const regionNames = new Intl.DisplayNames(['en-GB'], { type: 'region' });

/**
 * Every country the bank onboards from, sorted by name.
 *
 * Built once at module load: `Intl.DisplayNames` is not free, and this list is rendered by four
 * different fields in the wizard.
 */
export const COUNTRIES: readonly Country[] = SUPPORTED.split(' ')
  .map((value) => ({ value, label: regionNames.of(value) ?? value }))
  .sort((left, right) => left.label.localeCompare(right.label));

/** The country name for a code, falling back to the code itself. */
export function countryName(code: string | null | undefined): string {
  if (!code) return '';
  return regionNames.of(code) ?? code;
}
