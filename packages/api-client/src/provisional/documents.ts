/**
 * Provisional shapes for file handling, exports and passkey ceremonies.
 *
 * See `./README.md`: these fill gaps in the frozen contract's route map and are deleted
 * once the owning lane adds the real schema. Like the contract's own modules these are
 * bare *item* schemas — callers wrap them with `resource()` or `paginated()`.
 */

import { z } from 'zod';

import {
  entityId,
  isoDateTimeSchema,
  mediumTextSchema,
  shortTextSchema,
} from '@reliance/contracts';

/**
 * Signed-upload handshake payload.
 *
 * The API signs the upload rather than proxying the bytes, so a KYC document never
 * transits the banking API at all — the browser posts straight to the asset host with
 * these fields, and the API only ever learns the resulting asset id.
 */
export const uploadSignatureSchema = z.object({
  uploadUrl: z.url(),
  signature: z.string(),
  timestamp: z.number().int(),
  apiKey: z.string(),
  folder: z.string(),
  publicId: z.string(),
  expiresAt: isoDateTimeSchema,
  maxBytes: z.number().int().positive(),
  allowedMimeTypes: z.array(z.string()).min(1),
});
/** Response of the signed-upload handshake. */
export type UploadSignature = z.infer<typeof uploadSignatureSchema>;

/** Metadata for a stored file, addressed by its opaque id. */
export const fileReferenceSchema = z.object({
  id: entityId('doc'),
  fileName: shortTextSchema,
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
  /** Short-lived signed URL; bank documents are never publicly addressable. */
  downloadUrl: z.url().nullable(),
  expiresAt: isoDateTimeSchema.nullable(),
  uploadedAt: isoDateTimeSchema,
});
/** Stored-file metadata. */
export type FileReference = z.infer<typeof fileReferenceSchema>;

/** Status shared by every asynchronous artefact this module describes. */
export const AsyncArtefactStatus = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  READY: 'READY',
  FAILED: 'FAILED',
} as const;
/** Status of an asynchronous artefact. */
export type AsyncArtefactStatus = (typeof AsyncArtefactStatus)[keyof typeof AsyncArtefactStatus];

/**
 * An asynchronous document build — a statement PDF, a transaction export, a data
 * takeout. Modelled as a job because a year of transactions is not something to render
 * inside a request/response cycle.
 */
export const documentJobSchema = z.object({
  id: z.string(),
  status: z.enum(AsyncArtefactStatus),
  format: z.enum(['CSV', 'OFX', 'PDF', 'JSON', 'ZIP']),
  /** Populated only once `status` is `READY`. */
  downloadUrl: z.url().nullable(),
  sizeBytes: z.number().int().nullable(),
  rowCount: z.number().int().nullable(),
  failureReason: shortTextSchema.nullable(),
  requestedAt: isoDateTimeSchema,
  readyAt: isoDateTimeSchema.nullable(),
  expiresAt: isoDateTimeSchema,
});
/** An asynchronous document build. */
export type DocumentJob = z.infer<typeof documentJobSchema>;

/** A bank-issued letter, once produced. */
export const bankLetterSchema = z.object({
  id: z.string(),
  kind: shortTextSchema,
  accountId: entityId('acc'),
  addressedTo: shortTextSchema.nullable(),
  downloadUrl: z.url().nullable(),
  issuedAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
});
/** A bank-issued letter. */
export type BankLetter = z.infer<typeof bankLetterSchema>;

/** A transaction receipt rendered for sharing or printing. */
export const transactionReceiptSchema = z.object({
  transactionId: entityId('txn'),
  reference: shortTextSchema,
  downloadUrl: z.url().nullable(),
  /** Inline HTML so the UI can show the receipt without a round trip to the PDF. */
  html: z.string(),
  generatedAt: isoDateTimeSchema,
});
/** A transaction receipt. */
export type TransactionReceipt = z.infer<typeof transactionReceiptSchema>;

/**
 * WebAuthn ceremony options, passed to the browser credential API unaltered.
 *
 * `publicKey` is an opaque record on purpose: its shape is defined by the WebAuthn spec
 * and the server's WebAuthn library, not by this bank. Re-declaring it here would create
 * a second source of truth that drifts from whatever that library actually emits.
 */
export const passkeyCeremonyOptionsSchema = z.object({
  challengeId: z.string(),
  publicKey: z.record(z.string(), z.unknown()),
  expiresAt: isoDateTimeSchema,
});
/** WebAuthn ceremony options. */
export type PasskeyCeremonyOptions = z.infer<typeof passkeyCeremonyOptionsSchema>;

/** The credential the browser produced, sent back for verification. */
export const passkeyVerificationRequestSchema = z.object({
  challengeId: z.string(),
  credential: z.record(z.string(), z.unknown()),
  label: shortTextSchema.optional(),
});
/** Body of a passkey verify call. */
export type PasskeyVerificationRequest = z.infer<typeof passkeyVerificationRequestSchema>;

/** A registered passkey as the security screen lists it. */
export const passkeySchema = z.object({
  id: z.string(),
  label: shortTextSchema,
  deviceLabel: shortTextSchema.nullable(),
  /** Authenticator attestation GUID, when the authenticator disclosed one. */
  aaguid: z.string().nullable(),
  backedUp: z.boolean(),
  lastUsedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
/** A registered passkey. */
export type Passkey = z.infer<typeof passkeySchema>;

/** Outcome of a passkey registration or authentication. */
export const passkeyVerificationResultSchema = z.object({
  verified: z.boolean(),
  passkey: passkeySchema.nullable(),
});
/** Outcome of a passkey ceremony. */
export type PasskeyVerificationResult = z.infer<typeof passkeyVerificationResultSchema>;

/** A customer's data-portability export, which is regulated and therefore audited. */
export const dataExportSchema = z.object({
  id: z.string(),
  status: z.enum(AsyncArtefactStatus),
  downloadUrl: z.url().nullable(),
  /** Categories included, so the customer can see what they are being given. */
  includes: z.array(shortTextSchema),
  note: mediumTextSchema.nullable(),
  requestedAt: isoDateTimeSchema,
  readyAt: isoDateTimeSchema.nullable(),
  expiresAt: isoDateTimeSchema,
});
/** A data-portability export. */
export type DataExport = z.infer<typeof dataExportSchema>;

/**
 * Proof of a recent step-up authentication.
 *
 * Returned in the body rather than set as a cookie: the token belongs in the
 * `x-step-up-token` header of the *one* sensitive call it authorises, and a cookie would
 * silently attach it to every request until it expired.
 */
export const stepUpGrantSchema = z.object({
  token: z.string(),
  /** The UI counts down against this and re-prompts rather than letting a call 403. */
  expiresAt: isoDateTimeSchema,
  issuedAt: isoDateTimeSchema,
});
/** A step-up authentication grant. */
export type StepUpGrant = z.infer<typeof stepUpGrantSchema>;
