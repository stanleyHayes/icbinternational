/**
 * What the customer has typed into the account-opening wizard but not yet sent.
 *
 * The server owns *progress* — `KycCase.completedSteps` and `nextStep` decide which screen the
 * customer lands on, so a resumed session cannot end up on a step that has already been accepted.
 * This file owns only the half-finished step in front of them: the address they were typing when
 * the phone rang. Without it, a refresh loses the typing; with it, the wizard comes back exactly
 * as it was left.
 *
 * Held in `sessionStorage` rather than a cookie or the server, because it is unverified personal
 * data — a date of birth and a home address — and it should not outlive the tab it was typed into.
 */

import { z } from 'zod';

import { EmploymentStatus, SourceOfFunds } from '@reliance/contracts';

import { clearStored, readStored, writeStored } from './browser-store';

const STORAGE_KEY = 'rb.onboarding';

/**
 * Every field is optional and unvalidated on purpose: this is a draft, and refusing to remember a
 * half-typed postcode because it is half-typed defeats the point. The real schemas run at submit.
 */
const draftSchema = z.object({
  dateOfBirth: z.string().optional(),
  nationality: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  employmentStatus: z.enum(EmploymentStatus).optional(),
  occupation: z.string().optional(),
  employerName: z.string().optional(),
  annualIncomeMajor: z.string().optional(),
  incomeCurrency: z.string().optional(),
  sourceOfFunds: z.enum(SourceOfFunds).optional(),
  sourceDetail: z.string().optional(),
});

/** The in-progress answers, as typed. */
export type KycDraft = z.infer<typeof draftSchema>;

/** Everything typed so far, or an empty draft on a first visit. */
export function readDraft(): KycDraft {
  return readStored(STORAGE_KEY, draftSchema) ?? {};
}

/** Merges new answers into the draft. Fields not mentioned keep their previous value. */
export function saveDraft(patch: KycDraft): KycDraft {
  const merged = { ...readDraft(), ...patch };
  writeStored(STORAGE_KEY, merged);
  return merged;
}

/** Discards the draft. Called once the case is submitted, or the customer abandons it. */
export function discardDraft(): void {
  clearStored(STORAGE_KEY);
}
