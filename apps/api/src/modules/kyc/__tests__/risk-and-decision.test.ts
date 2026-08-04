import {
  DocumentKind,
  EmploymentStatus,
  KycTier,
  RiskRating,
  SourceOfFunds,
} from '@reliance/contracts';

import { evaluateSubmission, DECISION_REASONS } from '../domain/auto-decision.js';
import { missingDocumentGroups, requiredDocumentGroups } from '../domain/required-documents.js';
import { computeRiskRating, type RiskFacts } from '../domain/risk-rating.js';

/**
 * The compliance rules, pinned as a matrix: every branch of the risk rating and every
 * outcome of the automated first pass, so a tuning change shows up here as a deliberate
 * edit rather than a silent behaviour shift.
 */

const CLEAN: RiskFacts = {
  nationality: 'GB',
  residenceCountry: 'GB',
  employmentStatus: EmploymentStatus.EMPLOYED,
  sourceOfFunds: SourceOfFunds.SALARY,
  requestedTier: KycTier.TIER_2,
};

function facts(patch: Partial<RiskFacts>): RiskFacts {
  return { ...CLEAN, ...patch };
}

describe('the risk rating', () => {
  it('rates a coherent low-tier file LOW', () => {
    expect(computeRiskRating(facts({ requestedTier: KycTier.TIER_1 }))).toBe(RiskRating.LOW);
    expect(computeRiskRating(CLEAN)).toBe(RiskRating.LOW);
  });

  it('refuses prohibited jurisdictions on nationality or residence', () => {
    expect(computeRiskRating(facts({ nationality: 'KP' }))).toBe(RiskRating.PROHIBITED);
    expect(computeRiskRating(facts({ residenceCountry: 'IR' }))).toBe(RiskRating.PROHIBITED);
  });

  it('flags elevated jurisdictions for human review', () => {
    expect(computeRiskRating(facts({ nationality: 'AF' }))).toBe(RiskRating.HIGH);
    expect(computeRiskRating(facts({ residenceCountry: 'SO' }))).toBe(RiskRating.HIGH);
  });

  it('flags an incoherent story: unemployed but living on a salary', () => {
    expect(computeRiskRating(facts({ employmentStatus: EmploymentStatus.UNEMPLOYED }))).toBe(
      RiskRating.HIGH,
    );
  });

  it('does not flag unemployment funded by unearned sources', () => {
    expect(
      computeRiskRating(
        facts({
          employmentStatus: EmploymentStatus.UNEMPLOYED,
          sourceOfFunds: SourceOfFunds.INHERITANCE,
        }),
      ),
    ).toBe(RiskRating.LOW);
  });

  it('rates tier 3 requests and catch-all answers MEDIUM', () => {
    expect(computeRiskRating(facts({ requestedTier: KycTier.TIER_3 }))).toBe(RiskRating.MEDIUM);
    expect(computeRiskRating(facts({ employmentStatus: EmploymentStatus.OTHER }))).toBe(
      RiskRating.MEDIUM,
    );
    expect(computeRiskRating(facts({ sourceOfFunds: SourceOfFunds.OTHER }))).toBe(
      RiskRating.MEDIUM,
    );
  });
});

describe('the automated first pass', () => {
  const assessment = {
    requestedTier: KycTier.TIER_1,
    riskRating: RiskRating.LOW,
    adult: true,
    documentsVerified: true,
    livenessPassed: true,
  } as const;

  it('auto-approves a clean tier 1 file', () => {
    expect(evaluateSubmission(assessment)).toEqual({
      type: 'APPROVE',
      tier: KycTier.TIER_1,
      reason: DECISION_REASONS.CLEAN_TIER_ONE,
    });
  });

  it('refuses a prohibited jurisdiction outright', () => {
    expect(evaluateSubmission({ ...assessment, riskRating: RiskRating.PROHIBITED })).toEqual({
      type: 'REJECT',
      reason: DECISION_REASONS.PROHIBITED_JURISDICTION,
    });
  });

  it('refuses an underage customer outright', () => {
    expect(evaluateSubmission({ ...assessment, adult: false })).toEqual({
      type: 'REJECT',
      reason: DECISION_REASONS.UNDERAGE,
    });
  });

  it('refers anything a machine should not settle', () => {
    expect(evaluateSubmission({ ...assessment, requestedTier: KycTier.TIER_2 }).type).toBe('REFER');
    expect(evaluateSubmission({ ...assessment, riskRating: RiskRating.MEDIUM }).type).toBe('REFER');
    expect(evaluateSubmission({ ...assessment, documentsVerified: false }).type).toBe('REFER');
    expect(evaluateSubmission({ ...assessment, livenessPassed: false }).type).toBe('REFER');
  });
});

describe('required documents', () => {
  it('asks tier 1 for identity only, tier 2 for address too, tier 3 for funds evidence', () => {
    expect(requiredDocumentGroups(KycTier.TIER_1)).toHaveLength(1);
    expect(requiredDocumentGroups(KycTier.TIER_2)).toHaveLength(2);
    expect(requiredDocumentGroups(KycTier.TIER_3)).toHaveLength(3);
    expect(requiredDocumentGroups(KycTier.TIER_0)).toHaveLength(0);
  });

  it('accepts any one kind from a group', () => {
    expect(missingDocumentGroups(KycTier.TIER_1, [DocumentKind.PASSPORT])).toHaveLength(0);
    expect(missingDocumentGroups(KycTier.TIER_1, [DocumentKind.DRIVING_LICENCE])).toHaveLength(0);
    expect(missingDocumentGroups(KycTier.TIER_1, [DocumentKind.OTHER])).toHaveLength(1);
  });

  it('names only the groups still missing', () => {
    const missing = missingDocumentGroups(KycTier.TIER_2, [DocumentKind.PASSPORT]);
    expect(missing).toEqual([[DocumentKind.PROOF_OF_ADDRESS]]);
  });
});
