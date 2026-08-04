/**
 * Collection names, model tokens and the limits the upload path enforces.
 *
 * Kept in one file so a limit is changed in one place and cannot disagree with itself
 * between the signing handshake and the byte-level check that follows it.
 */

export const FILE_ASSET_COLLECTION = 'file_assets';
export const FILE_ASSET_MODEL = 'FileAsset';

export const UPLOAD_TICKET_COLLECTION = 'upload_tickets';
export const UPLOAD_TICKET_MODEL = 'UploadTicket';

export const BYTES_PER_MEGABYTE = 1_048_576;
const SECONDS_PER_DAY = 86_400;

/** Largest single upload the bank accepts. Roughly a phone photograph of a passport. */
export const MAX_UPLOAD_MEGABYTES = 15;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MEGABYTES * BYTES_PER_MEGABYTE;

/** Bytes read from the head of a file when identifying it. Every signature we know fits. */
export const SNIFF_WINDOW_BYTES = 64;

/** Default life of a signed delivery URL for restricted material, in seconds. */
export const DEFAULT_SIGNED_URL_TTL_SECONDS = 300;

/** Life of the ticket returned by the signed-upload handshake, in seconds. */
export const UPLOAD_TICKET_TTL_SECONDS = 600;

/**
 * Life of the signature used to read an object's head back for identification.
 *
 * Short because it is spent immediately by the API itself and never leaves the process.
 */
export const HEAD_READ_TTL_SECONDS = 60;

/**
 * How long a spent or expired upload ticket is kept before Mongo reaps it.
 *
 * Kept past its usefulness on purpose: "who was issued the ticket this object was stored
 * against" is the question an investigator asks about a disputed document.
 */
export const UPLOAD_TICKET_RETENTION_DAYS = 30;
export const UPLOAD_TICKET_RETENTION_SECONDS = UPLOAD_TICKET_RETENTION_DAYS * SECONDS_PER_DAY;

/**
 * Who may read an asset once it is stored.
 *
 * `RESTRICTED` is the important one: identity documents, proof of address and signed
 * agreements are delivered only through a short-lived signed URL, never from an address
 * that keeps working after the customer's session ends.
 */
export const AssetVisibility = {
  PUBLIC: 'PUBLIC',
  RESTRICTED: 'RESTRICTED',
} as const;
export type AssetVisibility = (typeof AssetVisibility)[keyof typeof AssetVisibility];

/**
 * What the asset is for. Drives the allowed content types and the visibility default —
 * a marketing image and a passport scan are not the same kind of object.
 */
export const AssetPurpose = {
  IDENTITY_DOCUMENT: 'IDENTITY_DOCUMENT',
  PROOF_OF_ADDRESS: 'PROOF_OF_ADDRESS',
  DISPUTE_EVIDENCE: 'DISPUTE_EVIDENCE',
  SUPPORT_ATTACHMENT: 'SUPPORT_ATTACHMENT',
  PROFILE_PHOTO: 'PROFILE_PHOTO',
  CONTENT_MEDIA: 'CONTENT_MEDIA',
} as const;
export type AssetPurpose = (typeof AssetPurpose)[keyof typeof AssetPurpose];

/** Purposes whose material is confidential and must never be publicly addressable. */
export const RESTRICTED_PURPOSES: readonly AssetPurpose[] = Object.freeze([
  AssetPurpose.IDENTITY_DOCUMENT,
  AssetPurpose.PROOF_OF_ADDRESS,
  AssetPurpose.DISPUTE_EVIDENCE,
  AssetPurpose.SUPPORT_ATTACHMENT,
]);

/** Storage folder for each purpose, appended to the configured root folder. */
export const PURPOSE_FOLDER: Readonly<Record<AssetPurpose, string>> = Object.freeze({
  [AssetPurpose.IDENTITY_DOCUMENT]: 'identity',
  [AssetPurpose.PROOF_OF_ADDRESS]: 'address',
  [AssetPurpose.DISPUTE_EVIDENCE]: 'disputes',
  [AssetPurpose.SUPPORT_ATTACHMENT]: 'support',
  [AssetPurpose.PROFILE_PHOTO]: 'profiles',
  [AssetPurpose.CONTENT_MEDIA]: 'content',
});
