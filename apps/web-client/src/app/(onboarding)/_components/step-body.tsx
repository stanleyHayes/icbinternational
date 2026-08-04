'use client';

/**
 * Picks the form for a step.
 *
 * A lookup rather than a chain of conditionals, so adding a step is one entry and the compiler
 * complains if the contract grows a member this table does not cover.
 */

import type { ReactNode } from 'react';

import type { KycCase, KycStep } from '@reliance/contracts';

import { AddressStep } from './address-step';
import { DocumentsStep } from './documents-step';
import { EmploymentStep } from './employment-step';
import { IdentityStep } from './identity-step';
import { LivenessStep } from './liveness-step';
import { ReviewStep } from './review-step';
import { SourceOfFundsStep } from './source-of-funds-step';

/** Props for {@link StepBody}. */
export interface StepBodyProps {
  readonly step: KycStep;
  readonly kycCase: KycCase;
}

const FORMS: Readonly<Record<KycStep, (kycCase: KycCase) => ReactNode>> = {
  IDENTITY: () => <IdentityStep />,
  ADDRESS: () => <AddressStep />,
  EMPLOYMENT: () => <EmploymentStep />,
  SOURCE_OF_FUNDS: () => <SourceOfFundsStep />,
  DOCUMENTS: (kycCase) => <DocumentsStep kycCase={kycCase} />,
  LIVENESS: (kycCase) => <LivenessStep kycCase={kycCase} />,
  REVIEW: (kycCase) => <ReviewStep kycCase={kycCase} />,
};

/** The form belonging to one step. */
export function StepBody({ step, kycCase }: StepBodyProps) {
  return FORMS[step](kycCase);
}
