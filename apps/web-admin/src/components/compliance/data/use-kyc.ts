/**
 * Reading and deciding identity-verification cases.
 *
 * One mutation covers all three outcomes because the platform models them as one
 * decision, and splitting them here would let the console send an approval shaped
 * differently from a refusal. The refusal path carries a reason code and the exact
 * wording the customer will receive; the approval path carries the tier being granted and
 * the risk rating the analyst assigned. Neither can be sent without the other's fields
 * because the request type says so.
 */

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { KycStatus, RiskRating } from '@reliance/contracts';

import { QUEUE_PAGE_SIZE, queueQueryOptions } from '@/components/compliance/kit';
import { useApiClient } from '@/lib/api-client';

import { riskKeys } from './keys';

/** What the identity-review queue can be narrowed to. */
export interface KycQueueFilters {
  readonly status?: string;
  readonly assignedToId?: string;
}

/** The identity-review queue. */
export function useKycQueue(filters: KycQueueFilters) {
  const client = useApiClient();

  return useQuery({
    queryKey: riskKeys.kycQueue({ ...filters } as Record<string, string>),
    queryFn: async ({ signal }) =>
      client.admin.kycQueue(
        {
          limit: QUEUE_PAGE_SIZE,
          status: (filters.status || undefined) as KycStatus | undefined,
          assignedToId: filters.assignedToId || undefined,
        },
        { signal },
      ),
    ...queueQueryOptions,
  });
}

/** One identity case, with every document attached to it. */
export function useKycCase(caseId: string | null) {
  const client = useApiClient();

  return useQuery({
    queryKey: riskKeys.kycCase(caseId ?? ''),
    enabled: caseId !== null,
    queryFn: async ({ signal }) => (await client.admin.kycCase(caseId ?? '', { signal })).data,
    ...queueQueryOptions,
  });
}

/** An analyst's decision on one identity case. */
export interface KycDecisionInput {
  readonly caseId: string;
  readonly decision: 'APPROVE' | 'REJECT' | 'REQUEST_MORE_INFO';
  /** The tier being granted. Only meaningful on an approval. */
  readonly grantedTier?: number;
  /** The wording the customer receives. Mandatory on anything other than an approval. */
  readonly reviewerMessage?: string;
  readonly riskRating?: RiskRating;
}

/**
 * Records an identity decision.
 *
 * Invalidates the whole risk lane rather than just the case: a granted tier changes the
 * customer's limits, which the customer record and the monitoring queues both display.
 */
export function useDecideKyc() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: KycDecisionInput) =>
      (
        await client.admin.decideKyc(input.caseId, {
          decision: input.decision,
          grantedTier: input.grantedTier,
          reviewerMessage: input.reviewerMessage,
          riskRating: input.riskRating,
        })
      ).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: riskKeys.all }),
  });
}

/**
 * Applies one decision to several cases in turn.
 *
 * Sequential rather than parallel, and it stops at the first refusal. A bulk action that
 * fires forty requests at once and reports "31 succeeded" leaves an analyst with no way
 * to know which nine, and no safe way to retry. Stopping means the queue always reflects
 * exactly what was decided.
 */
export function useBulkKycDecision() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (inputs: readonly KycDecisionInput[]): Promise<number> => {
      let applied = 0;
      for (const input of inputs) {
        await client.admin.decideKyc(input.caseId, {
          decision: input.decision,
          grantedTier: input.grantedTier,
          reviewerMessage: input.reviewerMessage,
          riskRating: input.riskRating,
        });
        applied += 1;
      }
      return applied;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: riskKeys.all }),
  });
}
