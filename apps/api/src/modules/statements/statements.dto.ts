/**
 * Request and response shapes the frozen contract does not carry.
 *
 * `statementSchema`, `requestStatementSchema` and `requestLetterSchema` are all in
 * `@reliance/contracts` and are used from there. What is missing is the *letter* a
 * request produces — the client models it in `packages/api-client/src/provisional`, which
 * says in its own README that these fill gaps in the route map until the owning lane
 * supplies the real schema. This is that lane, so the shape is mirrored here field for
 * field; a proposal to promote `bankLetterSchema` into the contract belongs in
 * `docs/CONTRACT_CHANGES.md`.
 *
 * The download query is this module's own. It is not a customer-facing filter — it is the
 * signature the document routes check — so it has no business in a shared contract.
 */

import { z } from 'zod';

import {
  cursorQuerySchema,
  entityId,
  isoDateTimeSchema,
  shortTextSchema,
} from '@reliance/contracts';

/** A base64url HMAC-SHA256 digest, which is always well under this. */
const MAX_SIGNATURE_LENGTH = 128;

/** A bank-issued letter, as the client's provisional shape models it. */
export const bankLetterSchema = z.object({
  id: z.string(),
  kind: shortTextSchema,
  accountId: entityId('acc'),
  addressedTo: shortTextSchema.nullable(),
  downloadUrl: z.url().nullable(),
  issuedAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
});
export type BankLetter = z.infer<typeof bankLetterSchema>;

/** Paging over the statement archive and the letters list. */
export const listDocumentsQuerySchema = cursorQuerySchema;
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;

/**
 * What a signed download link carries.
 *
 * `account` and `addressedTo` appear on letter links only, and both are inside the
 * signature — a letter cannot be re-pointed at another account or re-addressed by editing
 * the URL, because either edit invalidates it.
 */
export const downloadQuerySchema = z.object({
  expires: z.string().regex(/^\d{1,15}$/, 'must be an expiry timestamp'),
  signature: z.string().min(1).max(MAX_SIGNATURE_LENGTH),
  account: entityId('acc').optional(),
  addressedTo: shortTextSchema.optional(),
});
export type DownloadQuery = z.infer<typeof downloadQuerySchema>;
