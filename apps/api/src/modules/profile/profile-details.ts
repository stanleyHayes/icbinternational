/**
 * The customer's own corrections to their details, sealed at rest.
 *
 * Every field here is personal data, so the whole set is encrypted into a single
 * AES-256-GCM blob with `SecretCipher` — the construction that already protects TOTP
 * secrets and the KYC answers — and only the owner id and the timestamp are stored in the
 * clear, where they can be indexed. A database dump without the environment key yields a
 * list of customer ids and nothing about anybody.
 *
 * Only *corrections* live here. The answers a customer gave during onboarding stay in the
 * KYC case that was decided on them; copying them across would leave the same personal
 * data in two places with nobody owning either copy. See `profile.service.ts` for how the
 * two are read together.
 *
 * The blob is validated on the way out: a ciphertext that opens to something unparseable
 * is corruption to surface loudly, not to coerce.
 */

import { z } from 'zod';

import {
  addressSchema,
  countryCodeSchema,
  EmploymentStatus,
  isoDateSchema,
  positiveMoneySchema,
  shortTextSchema,
  SourceOfFunds,
} from '@reliance/contracts';

import { type SecretCipher } from '../auth/support/secret-cipher.js';

/**
 * Every field of the contract's `Profile` a customer may set for themselves.
 *
 * Each is optional *and* nullable, and the two mean different things. An absent key is a
 * field the customer has never corrected, which reads through to whatever they said during
 * onboarding. A key present and null is a field they have deliberately cleared, and it
 * overrides the onboarding answer rather than falling back to it — otherwise "delete my
 * employer" would silently restore the employer they gave two years ago.
 */
export const profileDetailsSchema = z.object({
  dateOfBirth: isoDateSchema.nullable().optional(),
  nationality: countryCodeSchema.nullable().optional(),
  address: addressSchema.nullable().optional(),
  employmentStatus: z.enum(EmploymentStatus).nullable().optional(),
  occupation: shortTextSchema.nullable().optional(),
  employerName: shortTextSchema.nullable().optional(),
  annualIncome: positiveMoneySchema.nullable().optional(),
  sourceOfFunds: z.enum(SourceOfFunds).nullable().optional(),
  /**
   * Where the customer is tax-resident.
   *
   * The one profile field the KYC wizard never asks for, so this record is its only home
   * rather than an override of one.
   */
  taxResidency: countryCodeSchema.nullable().optional(),
});

/** The customer's own corrections to their details. */
export type ProfileDetails = z.infer<typeof profileDetailsSchema>;

/** Marker for a customer who has corrected nothing. */
export const EMPTY_DETAILS_SEALED = '';

/** Encrypts the corrections for storage. */
export function sealDetails(cipher: SecretCipher, details: ProfileDetails): string {
  return cipher.seal(JSON.stringify(details));
}

/**
 * Opens a stored blob. The empty marker means nothing has been corrected; anything else
 * must parse and validate — a blob that does not is tampered or written by an
 * incompatible version.
 */
export function openDetails(cipher: SecretCipher, sealed: string): ProfileDetails {
  if (sealed === EMPTY_DETAILS_SEALED) return {};
  return profileDetailsSchema.parse(JSON.parse(cipher.open(sealed)));
}

/**
 * Drops undefined keys so an absent field in a patch does not erase a stored one.
 *
 * The entries are widened to `unknown` deliberately. Under `exactOptionalPropertyTypes` an
 * absent optional field is absent rather than `undefined`, so TypeScript reads the filter
 * as always true; it is not, because a caller spreading a partially-built object can still
 * hand over an explicit `undefined`, and letting that through would blank a value the
 * customer had already given us.
 */
export function definedOnly(patch: ProfileDetails): ProfileDetails {
  const entries: readonly [string, unknown][] = Object.entries(patch);
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined)) as ProfileDetails;
}
