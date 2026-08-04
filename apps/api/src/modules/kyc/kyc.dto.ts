/**
 * Request shapes that are this lane's own.
 *
 * The frozen contract covers the customer-facing step bodies; these are the gaps the
 * plan's route map leaves to the module: the `DOCUMENTS` step marker (handoff open in
 * `docs/HANDOFFS.md` to fold it into the contract union), the upload handshake, the
 * analyst's decision, and the review-queue query.
 */

import { z } from 'zod';

import {
  cursorQuerySchema,
  KycStatus,
  mediumTextSchema,
  shortTextSchema,
  submitKycStepRequestSchema,
} from '@reliance/contracts';

const REVIEWER_MESSAGE_MAX = 500;

/**
 * The contract's step union plus the `DOCUMENTS` marker.
 *
 * The document step's answer is the attached files, not a body — but the case's
 * `nextStep` still has to advance past it, so the wizard posts the bare marker. The
 * contract change adding this variant is already proposed; when it lands, this local
 * union collapses back into the contract's.
 */
export const submitKycStepApiSchema = z.discriminatedUnion('step', [
  ...submitKycStepRequestSchema.options,
  z.object({ step: z.literal('DOCUMENTS') }),
]);
export type SubmitKycStepApi = z.infer<typeof submitKycStepApiSchema>;

/** Body of the signed-upload handshake. */
export const kycUploadSignatureRequestSchema = z.object({
  fileName: shortTextSchema,
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});
export type KycUploadSignatureRequest = z.infer<typeof kycUploadSignatureRequestSchema>;

/**
 * The analyst's decision on a case under review.
 *
 * An approval may grant *less* than the requested tier — never more: the customer is
 * told which tier their evidence supported, not handed access they did not ask for.
 */
/**
 * Tier 0 is "registered, unverified" and is a starting state rather than a decision, so an
 * approval always grants at least tier 1. Tier 3 is the highest the bank offers.
 */
const LOWEST_GRANTABLE_TIER = 1;
const HIGHEST_TIER = 3;

export const decideKycRequestSchema = z.discriminatedUnion('decision', [
  z.object({
    decision: z.literal('APPROVE'),
    tier: z.number().int().min(LOWEST_GRANTABLE_TIER).max(HIGHEST_TIER),
    reviewerMessage: mediumTextSchema.optional(),
  }),
  z.object({
    decision: z.literal('REJECT'),
    reviewerMessage: z.string().trim().min(1).max(REVIEWER_MESSAGE_MAX),
  }),
  z.object({
    decision: z.literal('REQUEST_MORE_INFO'),
    reviewerMessage: z.string().trim().min(1).max(REVIEWER_MESSAGE_MAX),
  }),
]);
export type DecideKycRequest = z.infer<typeof decideKycRequestSchema>;

/** The review queue's filter. Defaults to everything waiting on a human. */
export const adminKycQueueQuerySchema = cursorQuerySchema.extend({
  status: z.enum(KycStatus).optional(),
});
export type AdminKycQueueQuery = z.infer<typeof adminKycQueueQuerySchema>;
