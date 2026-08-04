/**
 * Reading disputes and deciding them.
 *
 * `decideDispute` is idempotency-keyed inside the client because deciding a dispute posts
 * real ledger entries — a lost dispute reverses the provisional credit, which is money
 * leaving the customer's account. A double-submitted decision would take it twice.
 *
 * Evidence is fetched per file rather than in a batch because the platform signs each
 * download link individually and those links are short-lived. Asking for all of them when
 * the workspace opens would mean most had expired by the time an analyst reached them.
 */

'use client';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import type { DisputeStatus } from '@reliance/contracts';

import { CONSOLE_KEY, QUEUE_PAGE_SIZE, queueQueryOptions } from '@/components/compliance/kit';
import { useApiClient } from '@/lib/api-client';

const DISPUTES = 'disputes' as const;

/** Cache keys for the dispute console. */
export const disputeKeys = {
  all: [CONSOLE_KEY, DISPUTES] as const,
  queue: (filters: Readonly<Record<string, string>>) =>
    [CONSOLE_KEY, DISPUTES, 'queue', filters] as const,
  evidence: (fileId: string) => [CONSOLE_KEY, DISPUTES, 'evidence', fileId] as const,
};

/** What the dispute queue can be narrowed to. */
export interface DisputeFilters {
  readonly status?: string;
}

/** The dispute queue. */
export function useDisputes(filters: DisputeFilters) {
  const client = useApiClient();

  return useQuery({
    queryKey: disputeKeys.queue({ ...filters } as Record<string, string>),
    queryFn: async ({ signal }) =>
      client.admin.disputes(
        {
          limit: QUEUE_PAGE_SIZE,
          status: (filters.status || undefined) as DisputeStatus | undefined,
        },
        { signal },
      ),
    ...queueQueryOptions,
  });
}

/** Signed links for every piece of evidence attached to a dispute. */
export function useDisputeEvidence(fileIds: readonly string[]) {
  const client = useApiClient();

  return useQueries({
    queries: fileIds.map((fileId) => ({
      queryKey: disputeKeys.evidence(fileId),
      queryFn: async ({ signal }: { signal: AbortSignal }) =>
        (await client.files.get(fileId, { signal })).data,
      ...queueQueryOptions,
    })),
  });
}

/** The bank's decision on a dispute. */
export interface DisputeOutcomeInput {
  readonly disputeId: string;
  readonly outcome: 'WON' | 'LOST' | 'WITHDRAWN';
  readonly outcomeSummary: string;
  /** Only meaningful when the dispute is lost and a provisional credit was given. */
  readonly reverseProvisionalCredit?: boolean;
}

/** Records the outcome of a dispute. Posts ledger entries, so it is replay-protected. */
export function useDecideDispute() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: DisputeOutcomeInput) =>
      (
        await client.admin.decideDispute(input.disputeId, {
          outcome: input.outcome,
          outcomeSummary: input.outcomeSummary,
          reverseProvisionalCredit: input.reverseProvisionalCredit,
        })
      ).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: disputeKeys.all }),
  });
}
