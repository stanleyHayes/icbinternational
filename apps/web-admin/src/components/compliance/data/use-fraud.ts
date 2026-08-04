/**
 * Fraud rules and the false positives they generate.
 *
 * Fraud sits beside monitoring rather than inside it because the two answer different
 * questions. A monitoring rule asks whether a pattern of behaviour should be reported;
 * a fraud rule asks whether this payment, right now, should be scored, challenged or
 * stopped. The second is measured in customers wrongly blocked, which is why every rule
 * here carries its false-positive rate next to what it caught.
 *
 * The platform takes the whole rule set on a write, so an edit sends the current set with
 * one member replaced. That is deliberate on its side — it makes a rule book a single
 * versioned artefact — and it means the console must never send a partial list.
 */

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { FraudRule } from '@reliance/api-client';

import { QUEUE_PAGE_SIZE, queueQueryOptions } from '@/components/compliance/kit';
import { useApiClient } from '@/lib/api-client';

import { riskKeys } from './keys';

/** The fraud rule book. */
export function useFraudRules() {
  const client = useApiClient();

  return useQuery({
    queryKey: riskKeys.fraudRules,
    queryFn: async ({ signal }) => client.admin.fraudRules({ limit: QUEUE_PAGE_SIZE }, { signal }),
    ...queueQueryOptions,
  });
}

/** A change to one rule within the current rule book. */
export interface FraudRuleUpdateInput {
  /** The whole rule book as the console last read it. */
  readonly current: readonly FraudRule[];
  readonly ruleId: string;
  readonly changes: Partial<FraudRule>;
}

function replaceRule(input: FraudRuleUpdateInput): readonly FraudRule[] {
  return input.current.map((rule) =>
    rule.id === input.ruleId ? { ...rule, ...input.changes } : rule,
  );
}

/** Enables, disables or retunes one fraud rule, sending the whole book back. */
export function useUpdateFraudRule() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: FraudRuleUpdateInput) => client.admin.updateFraudRules(replaceRule(input)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: riskKeys.fraudRules }),
  });
}
