import { z } from 'zod';

import { NameCheckResult, shortTextSchema, transferDestinationSchema } from '@reliance/contracts';

/**
 * Request and response shapes the contract does not yet declare.
 *
 * `routes.beneficiaries.verifyName` exists in the route map with no schema behind it, and
 * `beneficiarySchema` has no update shape at all — so the three front ends cannot validate
 * either call with the same definition the API uses, which is the whole reason the
 * contracts package exists. Both are proposed for the contract in
 * `docs/CONTRACT_CHANGES.md`; until then they are built here from contract primitives, so
 * adopting the real thing later is a re-export rather than a rewrite.
 */

/** Ask the receiving bank whether `accountName` holds the destination account. */
export const verifyPayeeNameRequestSchema = z.object({
  destination: transferDestinationSchema,
  /** The name the customer typed for the payee. */
  accountName: shortTextSchema,
});
export type VerifyPayeeNameRequest = z.infer<typeof verifyPayeeNameRequestSchema>;

/** The scheme's answer, and the registered name when it is safe to reveal it. */
export const verifyPayeeNameResponseSchema = z.object({
  result: z.enum(NameCheckResult),
  suggestion: shortTextSchema.nullable(),
});
export type VerifyPayeeNameResponse = z.infer<typeof verifyPayeeNameResponseSchema>;

/** The two fields a customer owns on a saved payee. The destination is immutable. */
export const updateBeneficiaryRequestSchema = z
  .object({
    nickname: shortTextSchema.optional(),
    isFavourite: z.boolean().optional(),
  })
  .refine((patch) => patch.nickname !== undefined || patch.isFavourite !== undefined, {
    message: 'Supply at least one field to change',
  });
export type UpdateBeneficiaryRequest = z.infer<typeof updateBeneficiaryRequestSchema>;

/** Filters for the saved-payee list. */
export const listBeneficiariesQuerySchema = z.object({
  favouritesOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});
export type ListBeneficiariesQuery = z.infer<typeof listBeneficiariesQuerySchema>;
