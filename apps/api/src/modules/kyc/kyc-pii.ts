/**
 * The case's personal data, sealed at rest.
 *
 * A KYC case is the most PII-dense record the bank holds (risk #9): date of birth,
 * home address, employer, income. So the answers are encrypted into a single AES-256-GCM
 * blob with `SecretCipher` — the same construction that protects TOTP secrets — and only
 * workflow metadata (status, tier, steps) is stored in the clear, where it can be
 * indexed and queried. A database dump without the environment key yields a workflow
 * skeleton and no personal data.
 *
 * The blob is validated with a local zod schema on the way out: a ciphertext that opens
 * to something unparseable is corruption to surface loudly, not to coerce.
 */

import { z } from 'zod';

import {
  addressSchema,
  countryCodeSchema,
  EmploymentStatus,
  isoDateSchema,
  mediumTextSchema,
  positiveMoneySchema,
  shortTextSchema,
  SourceOfFunds,
} from '@reliance/contracts';

import { type SecretCipher } from '../auth/support/secret-cipher.js';

/** The personal answers collected across the wizard's steps. All fields optional: the
 * blob grows as steps are answered, and a case is valid at every stage in between. */
export const kycPiiSchema = z.object({
  dateOfBirth: isoDateSchema.optional(),
  nationality: countryCodeSchema.optional(),
  address: addressSchema.optional(),
  employmentStatus: z.enum(EmploymentStatus).optional(),
  occupation: shortTextSchema.optional(),
  employerName: shortTextSchema.optional(),
  annualIncome: positiveMoneySchema.optional(),
  sourceOfFunds: z.enum(SourceOfFunds).optional(),
  sourceOfFundsDetail: mediumTextSchema.optional(),
});

/** The personal answers collected across the wizard's steps. */
export type KycPii = z.infer<typeof kycPiiSchema>;

/** Marker for a case that has answered nothing yet. */
export const EMPTY_PII_SEALED = '';

/** Encrypts the personal answers for storage. */
export function sealPii(cipher: SecretCipher, pii: KycPii): string {
  return cipher.seal(JSON.stringify(pii));
}

/**
 * Opens a stored blob. The empty marker means no answers yet; anything else must parse
 * and validate — a blob that does not is tampered or written by an incompatible version.
 */
export function openPii(cipher: SecretCipher, sealed: string): KycPii {
  if (sealed === EMPTY_PII_SEALED) return {};
  return kycPiiSchema.parse(JSON.parse(cipher.open(sealed)));
}
