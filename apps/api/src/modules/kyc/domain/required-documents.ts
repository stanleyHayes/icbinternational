/**
 * Which documents a tier demands, as pure data and pure questions.
 *
 * The requirement is expressed as groups of acceptable kinds: tier 1 needs *one of*
 * passport, national id or driving licence, not all three. A group is satisfied when at
 * least one of its kinds is attached to the case.
 */

import { DocumentKind, KycTier, type DocumentKind as DocumentKindType } from '@reliance/contracts';

/** Artefacts that prove identity. Any one of them satisfies the identity group. */
export const IDENTITY_DOCUMENT_KINDS: readonly DocumentKindType[] = Object.freeze([
  DocumentKind.PASSPORT,
  DocumentKind.NATIONAL_ID,
  DocumentKind.DRIVING_LICENCE,
]);

/** Artefacts that evidence where the money comes from. Any one satisfies the group. */
export const FUNDS_EVIDENCE_KINDS: readonly DocumentKindType[] = Object.freeze([
  DocumentKind.PAYSLIP,
  DocumentKind.BANK_STATEMENT,
  DocumentKind.BUSINESS_REGISTRATION,
]);

/** The groups each tier must satisfy, lowest tier first. */
const REQUIREMENTS_BY_TIER: Readonly<Record<number, readonly (readonly DocumentKindType[])[]>> = {
  [KycTier.TIER_0]: [],
  [KycTier.TIER_1]: [IDENTITY_DOCUMENT_KINDS],
  [KycTier.TIER_2]: [IDENTITY_DOCUMENT_KINDS, [DocumentKind.PROOF_OF_ADDRESS]],
  [KycTier.TIER_3]: [
    IDENTITY_DOCUMENT_KINDS,
    [DocumentKind.PROOF_OF_ADDRESS],
    FUNDS_EVIDENCE_KINDS,
  ],
};

/**
 * The acceptable-kind groups for a tier. Tier 0 requires nothing: it receives money,
 * it does not send it.
 */
export function requiredDocumentGroups(tier: number): readonly (readonly DocumentKindType[])[] {
  return REQUIREMENTS_BY_TIER[tier] ?? REQUIREMENTS_BY_TIER[KycTier.TIER_3] ?? [];
}

/**
 * The groups with nothing attached yet.
 *
 * Returned whole — the acceptable kinds, not just a count — so the refusal can tell the
 * customer exactly what would satisfy the gap: "a passport, national id or driving
 * licence", not "1 document missing".
 */
export function missingDocumentGroups(
  tier: number,
  attachedKinds: readonly DocumentKindType[],
): readonly (readonly DocumentKindType[])[] {
  return requiredDocumentGroups(tier).filter(
    (group) => !group.some((kind) => attachedKinds.includes(kind)),
  );
}
