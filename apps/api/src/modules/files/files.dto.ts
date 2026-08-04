/**
 * Wire shapes for the file endpoints.
 *
 * The frozen contract names the two routes (`routes.files.*`) but not their bodies, so
 * they are declared here from contract primitives. If the contract is ever unfrozen these
 * belong in `packages/contracts/src/modules/kyc.ts` beside `documentSchema`.
 */

import { z } from 'zod';

import { isoDateTimeSchema, shortTextSchema } from '@reliance/contracts';

import { AssetPurpose } from './files.constants.js';

export const signUploadRequestSchema = z.object({
  purpose: z.enum(AssetPurpose),
  fileName: shortTextSchema,
});
export type SignUploadRequest = z.infer<typeof signUploadRequestSchema>;

export const signedUploadTicketSchema = z.object({
  uploadUrl: z.url(),
  fields: z.record(z.string(), z.string()),
  storageKey: z.string(),
  expiresAt: isoDateTimeSchema,
  maxBytes: z.number().int().positive(),
  /** Human-readable list of accepted formats, for the form's help text. */
  acceptedFormats: z.string(),
});
export type SignedUploadTicketResponse = z.infer<typeof signedUploadTicketSchema>;

/**
 * What a client may say when it claims an upload finished.
 *
 * Nothing here describes the content, and that is the point. The purpose comes from the
 * ticket issued at signing time; the size and the bytes are read back from storage. An
 * earlier version of this body carried `headBytes` and `sizeBytes`, which meant the
 * magic-byte check ran against a string the uploader chose — a check of the envelope
 * dressed up as a check of the contents.
 */
export const confirmUploadRequestSchema = z.object({
  storageKey: z.string().min(1),
  fileName: shortTextSchema,
});
export type ConfirmUploadRequest = z.infer<typeof confirmUploadRequestSchema>;

export const fileAssetResponseSchema = z.object({
  id: z.string(),
  fileName: shortTextSchema,
  purpose: z.enum(AssetPurpose),
  contentType: z.string(),
  sizeBytes: z.number().int().positive(),
  /** Signed and short-lived for anything restricted; permanent only for public media. */
  url: z.string(),
  uploadedAt: isoDateTimeSchema,
});
export type FileAssetResponse = z.infer<typeof fileAssetResponseSchema>;

export const listFilesQuerySchema = z.object({
  purpose: z.enum(AssetPurpose).optional(),
});
export type ListFilesQuery = z.infer<typeof listFilesQuerySchema>;
