/**
 * What the application is allowed to know about the identity-verification vendors.
 *
 * Two external capabilities sit behind these ports: document OCR ("read this passport")
 * and liveness ("prove this selfie is a live person"). Both are abstract classes so Nest
 * resolves them as type and injection token at once — the same shape a real vendor
 * adapter (Onfido, Veriff, Jumio) would implement without a single caller changing.
 */

import { type DocumentKind } from '@reliance/contracts';

/** What the reader made of a document. */
export const OcrVerdict = {
  READABLE: 'READABLE',
  UNREADABLE: 'UNREADABLE',
} as const;
export type OcrVerdict = (typeof OcrVerdict)[keyof typeof OcrVerdict];

/** The fields an OCR pass extracts, plus how sure it is. */
export interface OcrExtraction {
  readonly verdict: OcrVerdict;
  /** Confidence in basis points (10_000 = certain). Null fields when UNREADABLE. */
  readonly confidenceBps: number;
  readonly documentNumber: string | null;
  /** Document expiry as an ISO calendar date, when one was read. */
  readonly expiresOn: string | null;
}

/** What an OCR pass is pointed at. */
export interface OcrInput {
  readonly documentId: string;
  readonly kind: DocumentKind;
  readonly fileName: string;
}

/** Reads the machine-readable content of an identity or evidence document. */
export abstract class OcrPort {
  abstract extract(input: OcrInput): Promise<OcrExtraction>;
}

/** What the liveness check concluded about a selfie. */
export const LivenessVerdict = {
  LIVE: 'LIVE',
  SPOOF_SUSPECT: 'SPOOF_SUSPECT',
} as const;
export type LivenessVerdict = (typeof LivenessVerdict)[keyof typeof LivenessVerdict];

/** The outcome of one liveness check. */
export interface LivenessResult {
  readonly verdict: LivenessVerdict;
  /** Likeness score in basis points (10_000 = certain match). */
  readonly scoreBps: number;
  /** Vendor-side reference for the check, for dispute reconstruction. */
  readonly reference: string;
}

/** What a liveness check is pointed at. */
export interface LivenessInput {
  readonly selfieDocumentId: string;
  readonly userId: string;
}

/** Decides whether a selfie was taken by a live person who is present right now. */
export abstract class LivenessPort {
  abstract check(input: LivenessInput): Promise<LivenessResult>;
}
