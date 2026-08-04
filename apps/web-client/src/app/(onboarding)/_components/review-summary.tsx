'use client';

/**
 * The read-back of everything the bank now holds.
 *
 * Values come from `profile.get`, not from the drafts this browser kept: a review screen that
 * reads back the customer's own typing confirms nothing, it has to confirm what was received.
 */

import type { KycCase, KycStep, Profile } from '@reliance/contracts';
import { MoneyText } from '@reliance/ui';

import { countryName } from '@/lib/countries';
import { formatDate } from '@/lib/format';

import { ReviewRow } from './review-row';

const EMPLOYMENT_LABELS: Readonly<Record<string, string>> = {
  EMPLOYED: 'Employed',
  SELF_EMPLOYED: 'Self-employed',
  STUDENT: 'Student',
  RETIRED: 'Retired',
  UNEMPLOYED: 'Not working at the moment',
  OTHER: 'Something else',
};

function addressLine(profile: Profile): string {
  const address = profile.address;
  if (!address) return '';
  return [
    address.line1,
    address.line2,
    address.city,
    address.region,
    address.postalCode,
    countryName(address.country),
  ]
    .filter(Boolean)
    .join(', ');
}

function humanise(value: string | null): string {
  if (!value) return '';
  return value.charAt(0) + value.slice(1).toLowerCase().replaceAll('_', ' ');
}

/** Props for {@link ReviewSummary}. */
export interface ReviewSummaryProps {
  readonly profile: Profile;
  readonly kycCase: KycCase;
  readonly onChange: (step: KycStep) => void;
}

function IdentityRows({ profile, onChange }: Omit<ReviewSummaryProps, 'kycCase'>) {
  return (
    <>
      <ReviewRow
        label="Date of birth"
        value={profile.dateOfBirth ? formatDate(profile.dateOfBirth) : ''}
        step="IDENTITY"
        onChange={onChange}
      />
      <ReviewRow
        label="Nationality"
        value={countryName(profile.nationality)}
        step="IDENTITY"
        onChange={onChange}
      />
      <ReviewRow
        label="Home address"
        value={addressLine(profile)}
        step="ADDRESS"
        onChange={onChange}
      />
    </>
  );
}

function WorkRows({ profile, onChange }: Omit<ReviewSummaryProps, 'kycCase'>) {
  const income = profile.annualIncome;

  return (
    <>
      <ReviewRow
        label="Employment"
        value={profile.employmentStatus ? EMPLOYMENT_LABELS[profile.employmentStatus] : ''}
        step="EMPLOYMENT"
        onChange={onChange}
      />
      <ReviewRow
        label="Job title"
        value={profile.occupation}
        step="EMPLOYMENT"
        onChange={onChange}
      />
      <ReviewRow
        label="Employer"
        value={profile.employerName}
        step="EMPLOYMENT"
        onChange={onChange}
      />
      <ReviewRow
        label="Annual income"
        value={income ? <MoneyText amount={income.amount} currency={income.currency} muted /> : ''}
        step="EMPLOYMENT"
        onChange={onChange}
      />
      <ReviewRow
        label="Source of funds"
        value={humanise(profile.sourceOfFunds)}
        step="SOURCE_OF_FUNDS"
        onChange={onChange}
      />
    </>
  );
}

/** Every answer, with a way back to the step that set it. */
export function ReviewSummary({ profile, kycCase, onChange }: ReviewSummaryProps) {
  return (
    <dl>
      <IdentityRows profile={profile} onChange={onChange} />
      <WorkRows profile={profile} onChange={onChange} />
      <ReviewRow
        label="Identity documents"
        value={kycCase.documents.map((document) => document.fileName).join(', ')}
        step="DOCUMENTS"
        onChange={onChange}
      />
    </dl>
  );
}
