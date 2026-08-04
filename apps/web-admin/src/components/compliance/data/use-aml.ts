/**
 * Monitoring alerts, investigation cases and the rules that raise them.
 *
 * `useBacktestRule` is the one worth reading. It is a mutation in the transport sense —
 * it is a POST — but it changes nothing, so it is exposed as a query the rule editor can
 * re-run as thresholds are dragged around. Tuning a rule without that number is guesswork
 * that either floods the queue or stops catching anything, and neither failure announces
 * itself for weeks.
 */

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AlertSeverity, AlertStatus, AmlRule } from '@reliance/contracts';

import { QUEUE_PAGE_SIZE, queueQueryOptions } from '@/components/compliance/kit';
import { useApiClient } from '@/lib/api-client';

import { riskKeys } from './keys';

/** What the monitoring queue can be narrowed to. */
export interface AlertFilters {
  readonly status?: string;
  readonly severity?: string;
  readonly assignedToId?: string;
}

/** The transaction-monitoring alert queue. */
export function useAmlAlerts(filters: AlertFilters) {
  const client = useApiClient();

  return useQuery({
    queryKey: riskKeys.alertQueue({ ...filters } as Record<string, string>),
    queryFn: async ({ signal }) =>
      client.admin.amlAlerts(
        {
          limit: QUEUE_PAGE_SIZE,
          status: (filters.status || undefined) as AlertStatus | undefined,
          severity: (filters.severity || undefined) as AlertSeverity | undefined,
          assignedToId: filters.assignedToId || undefined,
        },
        { signal },
      ),
    ...queueQueryOptions,
  });
}

/** Every open investigation. */
export function useAmlCases() {
  const client = useApiClient();

  return useQuery({
    queryKey: riskKeys.caseList,
    queryFn: async ({ signal }) => client.admin.amlCases({ limit: QUEUE_PAGE_SIZE }, { signal }),
    ...queueQueryOptions,
  });
}

/** One investigation, with its alerts, notes and evidence. */
export function useAmlCase(caseId: string | null) {
  const client = useApiClient();

  return useQuery({
    queryKey: riskKeys.caseDetail(caseId ?? ''),
    enabled: caseId !== null,
    queryFn: async ({ signal }) => (await client.admin.amlCase(caseId ?? '', { signal })).data,
    ...queueQueryOptions,
  });
}

/** A change to an investigation: assign it, note it, dispose of it, or file a report. */
export interface CaseUpdateInput {
  readonly caseId: string;
  readonly status?: string;
  readonly assignedToId?: string;
  readonly disposition?: string;
  readonly note?: string;
}

/** Advances an investigation. */
export function useUpdateAmlCase() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CaseUpdateInput) =>
      (
        await client.admin.updateAmlCase(input.caseId, {
          status: input.status,
          assignedToId: input.assignedToId,
          disposition: input.disposition,
          note: input.note,
        })
      ).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: riskKeys.cases }),
  });
}

/** The monitoring rule book, with how each rule has been performing. */
export function useAmlRules() {
  const client = useApiClient();

  return useQuery({
    queryKey: riskKeys.monitoringRules,
    queryFn: async ({ signal }) => client.admin.amlRules({ limit: QUEUE_PAGE_SIZE }, { signal }),
    ...queueQueryOptions,
  });
}

/** A retune of one rule. */
export interface RuleUpdateInput {
  readonly ruleId: string;
  readonly changes: Partial<AmlRule>;
}

/** Retunes or switches a monitoring rule. */
export function useUpdateAmlRule() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: RuleUpdateInput) =>
      (await client.admin.updateAmlRule(input.ruleId, input.changes)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: riskKeys.rules }),
  });
}

/**
 * Replays a rule over history.
 *
 * Kept out of the cache's normal invalidation: a backtest is a statement about a specific
 * window and a specific set of thresholds, and it stays true until one of those changes.
 */
export function useRuleBacktest(ruleId: string | null, windowDays: number) {
  const client = useApiClient();

  return useQuery({
    queryKey: riskKeys.backtest(ruleId ?? '', windowDays),
    enabled: ruleId !== null,
    queryFn: async () => (await client.admin.backtestRule(ruleId ?? '', { windowDays })).data,
    staleTime: Number.POSITIVE_INFINITY,
  });
}
