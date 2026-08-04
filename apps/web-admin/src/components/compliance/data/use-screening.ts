/**
 * Sanctions, PEP, adverse-media and internal-watchlist hits.
 *
 * The platform exposes one collection for all four kinds and distinguishes them by
 * `matchType`, so the console filters rather than fetching four times. That also keeps
 * the internal watchlist honest: it is screened, adjudicated and audited by exactly the
 * same path as a sanctions list, instead of being a side table somebody edits by hand.
 */

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ScreeningHit } from '@reliance/api-client';

import { QUEUE_PAGE_SIZE, queueQueryOptions } from '@/components/compliance/kit';
import { useApiClient } from '@/lib/api-client';

import { riskKeys } from './keys';

/** The kinds of list a hit can come from. */
export type MatchType = ScreeningHit['matchType'];

/** What the screening queue can be narrowed to. */
export interface ScreeningFilters {
  readonly status?: string;
  readonly matchType?: string;
  /** Lowest match score worth showing, as typed into the filter bar. */
  readonly minScore?: string;
}

function matches(hit: ScreeningHit, filters: ScreeningFilters): boolean {
  if (filters.status && hit.status !== filters.status) return false;
  if (filters.matchType && hit.matchType !== filters.matchType) return false;
  if (filters.minScore && hit.matchScore < Number(filters.minScore)) return false;
  return true;
}

/** Highest score first: the hit most likely to be the customer is the one to open. */
function byScoreDescending(left: ScreeningHit, right: ScreeningHit): number {
  return right.matchScore - left.matchScore;
}

/**
 * The screening queue.
 *
 * Status is applied by the platform; match type and score are applied here, because the
 * endpoint takes neither and asking for everything and narrowing locally is honest about
 * what is happening rather than pretending the server did it.
 */
export function useScreeningQueue(filters: ScreeningFilters) {
  const client = useApiClient();

  return useQuery({
    queryKey: riskKeys.screeningQueue({ ...filters } as Record<string, string>),
    queryFn: async ({ signal }): Promise<readonly ScreeningHit[]> => {
      const page = await client.admin.screeningHits({ limit: QUEUE_PAGE_SIZE }, { signal });
      return page.data.filter((hit) => matches(hit, filters)).sort(byScoreDescending);
    },
    ...queueQueryOptions,
  });
}

/** An adjudication on one hit. */
export interface ScreeningDispositionInput {
  readonly hitId: string;
  readonly status: 'TRUE_MATCH' | 'FALSE_POSITIVE' | 'ESCALATED';
  /** Reason code and the analyst's sentence, joined into the note the platform keeps. */
  readonly note: string;
}

/** Records a decision on a screening hit. */
export function useDecideScreeningHit() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ScreeningDispositionInput) =>
      client.admin.decideScreeningHit({
        hitId: input.hitId,
        status: input.status,
        note: input.note,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: riskKeys.all }),
  });
}
