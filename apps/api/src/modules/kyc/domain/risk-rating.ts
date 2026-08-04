/**
 * The customer risk rating, as a pure function of the facts the case collected.
 *
 * The rating is deterministic and rule-based on purpose: a compliance officer must be
 * able to look at a case and say exactly why it reads HIGH, and a regression suite must
 * be able to pin every branch. The country lists are a compliance decision expressed as
 * data — changing them is a policy change, reviewed like one.
 */

import {
  EmploymentStatus,
  KycTier,
  RiskRating,
  SourceOfFunds,
  type EmploymentStatus as EmploymentStatusType,
  type RiskRating as RiskRatingType,
  type SourceOfFunds as SourceOfFundsType,
} from '@reliance/contracts';

/** The facts a rating is computed from. Anything not yet answered is simply absent. */
export interface RiskFacts {
  readonly nationality: string | null;
  readonly residenceCountry: string | null;
  readonly employmentStatus: EmploymentStatusType | null;
  readonly sourceOfFunds: SourceOfFundsType | null;
  readonly requestedTier: number;
}

/**
 * Jurisdictions the bank does not onboard from at all. A resident or national of one of
 * these is not a risk to price but a refusal to record.
 */
export const PROHIBITED_COUNTRY_CODES: readonly string[] = Object.freeze(['KP', 'IR', 'CU', 'SY']);

/** Jurisdictions whose customers always get a human review, however clean the file. */
export const ELEVATED_RISK_COUNTRY_CODES: readonly string[] = Object.freeze([
  'AF',
  'BY',
  'IQ',
  'LY',
  'MM',
  'NI',
  'SO',
  'SD',
  'VE',
  'YE',
]);

/** Sources of funds consistent with having no employment income. */
const UNEARNED_INCOME_SOURCES: readonly SourceOfFundsType[] = Object.freeze([
  SourceOfFunds.SAVINGS,
  SourceOfFunds.PENSION,
  SourceOfFunds.INHERITANCE,
  SourceOfFunds.PROPERTY_SALE,
  SourceOfFunds.INVESTMENTS,
]);

/** Rates one customer. The first rule that matches wins; they are ordered by severity. */
export function computeRiskRating(facts: RiskFacts): RiskRatingType {
  if (touches(facts, PROHIBITED_COUNTRY_CODES)) return RiskRating.PROHIBITED;
  if (touches(facts, ELEVATED_RISK_COUNTRY_CODES)) return RiskRating.HIGH;
  if (hasInconsistentStory(facts)) return RiskRating.HIGH;
  if (facts.requestedTier >= KycTier.TIER_3) return RiskRating.MEDIUM;
  if (facts.employmentStatus === EmploymentStatus.OTHER) return RiskRating.MEDIUM;
  if (facts.sourceOfFunds === SourceOfFunds.OTHER) return RiskRating.MEDIUM;
  return RiskRating.LOW;
}

/** True when nationality or residence lands on the given list. */
function touches(facts: RiskFacts, countries: readonly string[]): boolean {
  return (
    (facts.nationality !== null && countries.includes(facts.nationality)) ||
    (facts.residenceCountry !== null && countries.includes(facts.residenceCountry))
  );
}

/**
 * An unemployed customer whose money arrives as a salary is a story that does not add
 * up. Not proof of anything — but exactly what a reviewer should look at. Unearned
 * sources (savings, a pension, an inheritance) are perfectly consistent with having no
 * job, so they do not trip the rule.
 */
function hasInconsistentStory(facts: RiskFacts): boolean {
  if (facts.employmentStatus !== EmploymentStatus.UNEMPLOYED) return false;
  if (facts.sourceOfFunds === null) return false;
  return !UNEARNED_INCOME_SOURCES.includes(facts.sourceOfFunds);
}
