/**
 * Collection names, lifecycle constants and the audit allow-list for the KYC lane.
 *
 * Kept in one file so a retention decision — how long an approval lasts, how old a
 * customer must be — is changed in exactly one place and cannot disagree with itself
 * between the decision path and the expiry path.
 */

export const KYC_CASE_COLLECTION = 'kyc_cases';
export const KYC_CASE_MODEL = 'KycCase';

/** Audit entity family for case-level events. */
export const KYC_AUDIT_ENTITY = 'kyc_case';
export const KYC_DOCUMENT_AUDIT_ENTITY = 'kyc_document';

/**
 * How long an approval stands before the customer must re-verify, in months.
 *
 * Re-KYC on a cycle is not bureaucracy for its own sake: addresses change, documents
 * lapse, and a risk decision made two years ago is being made about a person the bank
 * no longer knows. When the validity runs out the tier falls back to 0 until the
 * customer renews.
 */
export const REKYC_VALIDITY_MONTHS = 24;

/** Statutory minimum age for holding an account, checked at the IDENTITY step. */
export const MINIMUM_AGE_YEARS = 18;

/** Life of the signed preview URL handed out with a document read, in seconds. */
export const KYC_PREVIEW_TTL_SECONDS = 300;

/** Largest number of documents one case may carry. */
export const MAX_DOCUMENTS_PER_CASE = 12;

/** How many expired cases one expiry sweep retires per run. */
export const EXPIRY_SWEEP_BATCH = 200;

/** Folder label reported in the upload handshake when the provider supplies none. */
export const KYC_UPLOAD_FOLDER = 'reliance/kyc';

/**
 * The fields the audit trail may record from a KYC case.
 *
 * An allow-list rather than a deny-list (risk #9): the case carries a sealed PII blob
 * and document metadata, and enumerating the handful of fields that are safe to keep is
 * a defensible position — a new field defaults to *not* being recorded.
 */
export const KYC_AUDIT_CAPTURE_FIELDS: readonly string[] = Object.freeze([
  'status',
  'currentTier',
  'requestedTier',
  'riskRating',
  'reviewerMessage',
  'completedSteps',
  'submittedAt',
  'decidedAt',
  'expiresAt',
]);
