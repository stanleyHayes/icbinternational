/**
 * Assembling the contract's `Profile` from the two records that hold it.
 *
 * The onboarding answers are the base layer and the customer's own corrections sit over
 * them, field by field. That ordering is the whole rule: what the customer last told us
 * wins, and anything they have never touched still reads back as whatever they said when
 * they opened the account.
 *
 * Every field is spelled out rather than spread. A new personal field added to either record
 * tomorrow cannot appear in an API response by accident — it has to be added here.
 */

import { type Profile } from '@reliance/contracts';

import { type KycPii } from '../kyc/kyc-pii.js';

import { type ProfileDetails } from './profile-details.js';

/** The two layers a profile is read from, plus when the top one last moved. */
export interface ProfileSources {
  readonly userId: string;
  readonly answers: KycPii;
  readonly corrections: ProfileDetails;
  readonly updatedAt: Date;
}

/** The customer's profile as the contract defines it. */
export function toContractProfile(sources: ProfileSources): Profile {
  const { answers, corrections } = sources;

  return {
    userId: sources.userId,
    dateOfBirth: layer(corrections.dateOfBirth, answers.dateOfBirth),
    nationality: layer(corrections.nationality, answers.nationality),
    address: layer(corrections.address, answers.address),
    employmentStatus: layer(corrections.employmentStatus, answers.employmentStatus),
    occupation: layer(corrections.occupation, answers.occupation),
    employerName: layer(corrections.employerName, answers.employerName),
    annualIncome: layer(corrections.annualIncome, answers.annualIncome),
    sourceOfFunds: layer(corrections.sourceOfFunds, answers.sourceOfFunds),
    // Never collected by the wizard, so the corrections record is its only source.
    taxResidency: corrections.taxResidency ?? null,
    updatedAt: sources.updatedAt.toISOString(),
  };
}

/**
 * One field: the correction if the customer has ever set it, otherwise the answer.
 *
 * The test is `undefined`, not falsy and not null, and the distinction carries real weight.
 * A correction holding `null` is a field the customer deliberately cleared — it wins, and
 * falling through to the onboarding answer there would quietly restore an employer they had
 * asked us to forget. Only a field they have never touched is absent.
 *
 * That the two stay distinct in storage is not an accident either: `JSON.stringify` drops a
 * key whose value is `undefined` and keeps one whose value is `null`, so the sealed blob
 * round-trips the difference exactly.
 */
function layer<TValue>(
  correction: TValue | null | undefined,
  answer: TValue | undefined,
): TValue | null {
  if (correction !== undefined) return correction;
  return answer ?? null;
}
