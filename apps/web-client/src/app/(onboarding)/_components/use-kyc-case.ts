'use client';

/**
 * The customer's KYC case, and the mutations that move it forward.
 *
 * Every step submission returns the whole case, so the mutations write it straight back into the
 * cache rather than invalidating and refetching. That is what makes the wizard feel instant, and
 * more importantly it means the step the customer lands on next is the step the *server* just
 * said comes next — never a stale one from before the write.
 */

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import {
  kycCaseSchema,
  resource,
  routes,
  type KycCase,
  type KycStep,
  type Resource,
  type SubmitKycStepRequest,
} from '@reliance/contracts';

import { browserApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

/** The tier a personal current account is opened at. */
const DEFAULT_TIER = 2;

/** The current case. `NOT_STARTED` is a real state, not an error — the wizard opens the case. */
export function useKycCase(): UseQueryResult<KycCase> {
  return useQuery({
    queryKey: queryKeys.kyc.status(),
    queryFn: async () => (await browserApi().kyc.status()).data,
    // The case changes only when this wizard changes it, and every change is written back below.
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** Writes a freshly-returned case into the cache. */
function useCaseWriter() {
  const queryClient = useQueryClient();
  return (kycCase: KycCase) => queryClient.setQueryData(queryKeys.kyc.status(), kycCase);
}

/** Opens a case for a customer who has not started one. */
export function useStartKyc() {
  const write = useCaseWriter();
  return useMutation({
    mutationFn: async () => (await browserApi().kyc.start({ requestedTier: DEFAULT_TIER })).data,
    onSuccess: write,
  });
}

/** One step's answers. */
export interface StepSubmission {
  readonly step: KycStep;
  readonly body: SubmitKycStepRequest;
}

/** Submits one step. Idempotent by identity: sending `ADDRESS` twice leaves one address. */
export function useSubmitStep() {
  const write = useCaseWriter();
  return useMutation({
    mutationFn: async ({ step, body }: StepSubmission) =>
      (await browserApi().kyc.submitStep(step, body)).data,
    onSuccess: write,
  });
}

const caseResource = resource(kycCaseSchema);

/**
 * Marks the document-upload step done.
 *
 * `submitKycStepRequestSchema` has a variant for every step except `DOCUMENTS`, whose answer is the
 * attached files rather than a body — so there is no typed resource method for it and this goes
 * through the client's own transport instead. A handoff note is open against `packages/contracts`
 * to add the variant; when it lands this collapses into `useSubmitStep`.
 */
export function useCompleteDocuments() {
  const write = useCaseWriter();
  return useMutation({
    mutationFn: async () => {
      const answer = await browserApi().http.put<Resource<KycCase>>({
        path: routes.kyc.step('DOCUMENTS'),
        body: { step: 'DOCUMENTS' },
        schema: caseResource,
      });
      return answer.data;
    },
    onSuccess: write,
  });
}

/** Sends the case for review. Refused by the API while a required step is outstanding. */
export function useSubmitCase() {
  const write = useCaseWriter();
  return useMutation({
    mutationFn: async () => (await browserApi().kyc.submit()).data,
    onSuccess: write,
  });
}
