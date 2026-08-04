/**
 * The automated first-pass decision on a submitted case, as a pure function.
 *
 * Some outcomes are safe for a machine: refusing a prohibited jurisdiction, approving a
 * clean tier-1 file. Everything ambiguous goes to a human — a simulator that
 * auto-declined honest customers or auto-approved dubious ones would be teaching the
 * wrong lesson about what automation is for. The rules are ordered; the first match
 * wins, and each carries the reason it fired so the audit trail can say why.
 */

import { KycTier, RiskRating, type RiskRating as RiskRatingType } from '@reliance/contracts';

/** A document's readiness as the decision sees it. */
export interface DecisionDocument {
  /** OCR (or the liveness check, for a selfie) accepted the artefact. */
  readonly verified: boolean;
}

/** Everything the automated pass knows about a submitted case. */
export interface SubmissionAssessment {
  readonly requestedTier: number;
  readonly riskRating: RiskRatingType;
  /** False when the date of birth on file is below the statutory minimum age. */
  readonly adult: boolean;
  /** Every attached identity/address/funds document has passed its check. */
  readonly documentsVerified: boolean;
  /** The liveness check on the selfie came back LIVE. */
  readonly livenessPassed: boolean;
}

export type AutoDecision =
  | { readonly type: 'APPROVE'; readonly tier: number; readonly reason: string }
  | { readonly type: 'REJECT'; readonly reason: string }
  | { readonly type: 'REFER'; readonly reason: string };

/** Reasons, named so the audit event and the test suite quote the same string. */
export const DECISION_REASONS = {
  UNDERAGE: 'customer-under-legal-age',
  PROHIBITED_JURISDICTION: 'prohibited-jurisdiction',
  DOCUMENT_NOT_VERIFIED: 'document-could-not-be-verified',
  LIVENESS_NOT_PASSED: 'liveness-check-not-passed',
  ELEVATED_RISK: 'risk-rating-requires-review',
  TIER_REQUIRES_REVIEW: 'requested-tier-requires-manual-review',
  CLEAN_TIER_ONE: 'clean-file-tier-one',
} as const;

/** Decides a submitted case. Machine-safe outcomes only; everything else is referred. */
export function evaluateSubmission(assessment: SubmissionAssessment): AutoDecision {
  if (!assessment.adult) return { type: 'REJECT', reason: DECISION_REASONS.UNDERAGE };
  if (assessment.riskRating === RiskRating.PROHIBITED) {
    return { type: 'REJECT', reason: DECISION_REASONS.PROHIBITED_JURISDICTION };
  }
  if (!assessment.documentsVerified) {
    return { type: 'REFER', reason: DECISION_REASONS.DOCUMENT_NOT_VERIFIED };
  }
  if (!assessment.livenessPassed) {
    return { type: 'REFER', reason: DECISION_REASONS.LIVENESS_NOT_PASSED };
  }
  if (assessment.riskRating !== RiskRating.LOW) {
    return { type: 'REFER', reason: DECISION_REASONS.ELEVATED_RISK };
  }
  if (assessment.requestedTier > KycTier.TIER_1) {
    return { type: 'REFER', reason: DECISION_REASONS.TIER_REQUIRES_REVIEW };
  }
  return {
    type: 'APPROVE',
    tier: KycTier.TIER_1,
    reason: DECISION_REASONS.CLEAN_TIER_ONE,
  };
}
