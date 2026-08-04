/**
 * What each kind of upload is allowed to be, and what happens when it is not.
 *
 * The policy is expressed in terms of what the *bytes* turn out to be. The declared MIME
 * type is compared against that only to catch an honest mismatch worth telling the
 * customer about; it is never the thing that grants permission.
 *
 * Pure: the whole decision is `(purpose, bytes, declaredType, size) → verdict`, which is
 * exactly the shape you want to be able to test against real file headers.
 */

import { HOSTILE_TYPE_LABEL, SniffedType, sniffContent } from './content-sniffer.js';
import { AssetPurpose, MAX_UPLOAD_BYTES, MAX_UPLOAD_MEGABYTES } from './files.constants.js';

/** Content types acceptable for each purpose, in the order a customer would expect. */
export const ALLOWED_TYPES: Readonly<Record<AssetPurpose, readonly SniffedType[]>> = Object.freeze({
  [AssetPurpose.IDENTITY_DOCUMENT]: [
    SniffedType.PDF,
    SniffedType.JPEG,
    SniffedType.PNG,
    SniffedType.HEIC,
  ],
  [AssetPurpose.PROOF_OF_ADDRESS]: [SniffedType.PDF, SniffedType.JPEG, SniffedType.PNG],
  [AssetPurpose.DISPUTE_EVIDENCE]: [
    SniffedType.PDF,
    SniffedType.JPEG,
    SniffedType.PNG,
    SniffedType.HEIC,
  ],
  [AssetPurpose.SUPPORT_ATTACHMENT]: [
    SniffedType.PDF,
    SniffedType.JPEG,
    SniffedType.PNG,
    SniffedType.CSV,
  ],
  [AssetPurpose.PROFILE_PHOTO]: [SniffedType.JPEG, SniffedType.PNG, SniffedType.WEBP],
  [AssetPurpose.CONTENT_MEDIA]: [
    SniffedType.JPEG,
    SniffedType.PNG,
    SniffedType.WEBP,
    SniffedType.GIF,
    SniffedType.SVG,
  ],
});

/** Everyday names for the formats, so the refusal message reads like a bank's. */
const TYPE_LABEL: Readonly<Record<SniffedType, string>> = Object.freeze({
  [SniffedType.PDF]: 'PDF',
  [SniffedType.PNG]: 'PNG',
  [SniffedType.JPEG]: 'JPEG',
  [SniffedType.GIF]: 'GIF',
  [SniffedType.WEBP]: 'WebP',
  [SniffedType.HEIC]: 'HEIC',
  [SniffedType.TIFF]: 'TIFF',
  [SniffedType.SVG]: 'SVG',
  [SniffedType.CSV]: 'CSV',
});

export type UploadVerdict =
  | { readonly accepted: true; readonly contentType: SniffedType }
  | { readonly accepted: false; readonly reason: string };

export interface UploadCandidate {
  readonly purpose: AssetPurpose;
  readonly bytes: Uint8Array;
  readonly sizeBytes: number;
}

/**
 * Decides whether a set of bytes may be stored.
 *
 * Order matters: size first because it is cheap, then identification, then the allow-list.
 * A rejected upload gets a message a customer can act on — which format to use — never a
 * MIME type or an error code.
 */
export function assessUpload(candidate: UploadCandidate): UploadVerdict {
  if (candidate.sizeBytes > MAX_UPLOAD_BYTES) {
    return {
      accepted: false,
      reason: `That file is larger than ${MAX_UPLOAD_MEGABYTES}MB. Please upload a smaller copy.`,
    };
  }

  const outcome = sniffContent(candidate.bytes);

  if (outcome.kind === 'REJECTED') {
    return {
      accepted: false,
      reason:
        `This file is ${HOSTILE_TYPE_LABEL[outcome.reason]}, whatever its name suggests, ` +
        `and we cannot accept it. Please upload ${describeAllowed(candidate.purpose)}.`,
    };
  }

  if (outcome.kind === 'UNKNOWN') {
    return {
      accepted: false,
      reason: `We could not read this file. Please upload ${describeAllowed(candidate.purpose)}.`,
    };
  }

  if (!ALLOWED_TYPES[candidate.purpose].includes(outcome.contentType)) {
    return {
      accepted: false,
      reason:
        `We cannot accept a ${TYPE_LABEL[outcome.contentType]} file here. ` +
        `Please upload ${describeAllowed(candidate.purpose)}.`,
    };
  }

  return { accepted: true, contentType: outcome.contentType };
}

/** "a PDF, JPEG or PNG" — an English list, because the customer reads it. */
export function describeAllowed(purpose: AssetPurpose): string {
  const labels = ALLOWED_TYPES[purpose].map((type) => TYPE_LABEL[type]);
  const last = labels.at(-1) ?? '';
  if (labels.length === 1) return `a ${last}`;
  return `a ${labels.slice(0, -1).join(', ')} or ${last}`;
}
