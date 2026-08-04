/**
 * Finding a customer, and the two actions that change one.
 *
 * Both mutations here are consequential and both are audited by the platform, so both
 * take a written reason rather than offering a bare confirm. Freezing stops a person
 * being paid; impersonation puts their entire financial life on a colleague's screen.
 * Neither is something the console should let anybody do by reflex.
 */

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { UserStatus } from '@reliance/contracts';

import { QUEUE_PAGE_SIZE, queueQueryOptions } from '@/components/compliance/kit';
import { useApiClient } from '@/lib/api-client';

import { customerKeys } from './keys';

/** What the search form can narrow on. */
export interface CustomerSearchFilters {
  readonly search?: string;
  readonly status?: string;
  readonly kycTier?: string;
  readonly segment?: string;
}

function toQuery(filters: CustomerSearchFilters) {
  return {
    limit: QUEUE_PAGE_SIZE,
    search: filters.search || undefined,
    status: (filters.status || undefined) as UserStatus | undefined,
    kycTier: filters.kycTier ? Number(filters.kycTier) : undefined,
    segment: filters.segment || undefined,
  };
}

/** Customer search. Runs on every keystroke the caller debounces into it. */
export function useCustomerSearch(filters: CustomerSearchFilters) {
  const client = useApiClient();

  return useQuery({
    queryKey: customerKeys.search({ ...filters } as Record<string, string>),
    queryFn: async ({ signal }) => client.admin.customers(toQuery(filters), { signal }),
    ...queueQueryOptions,
  });
}

/** One customer's own record. */
export function useCustomer(customerId: string) {
  const client = useApiClient();

  return useQuery({
    queryKey: customerKeys.detail(customerId),
    queryFn: async ({ signal }) => (await client.admin.customer(customerId, { signal })).data,
    ...queueQueryOptions,
  });
}

/** Arguments for a freeze or a release. */
export interface FreezeInput {
  readonly frozen: boolean;
  readonly reason: string;
}

/**
 * Freezes or releases a customer.
 *
 * A freeze ends the customer's sessions and refuses new sign-ins as well as stopping
 * outgoing payments, so the console words it as the whole thing rather than as a payment
 * block that quietly does more.
 */
export function useFreezeCustomer(customerId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: FreezeInput) => client.admin.freezeCustomer(customerId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customerKeys.all }),
  });
}

/** Arguments for an impersonation grant. */
export interface ImpersonationInput {
  readonly justification: string;
  readonly readOnly: boolean;
}

/**
 * Issues a time-boxed impersonation grant.
 *
 * The justification is not a formality: the platform records it verbatim in the audit
 * chain and the console shows it in the banner for as long as the grant is live, so the
 * operator's stated reason is visible to anyone who walks past their screen.
 */
export function useImpersonateCustomer(customerId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ImpersonationInput) =>
      (await client.admin.impersonate(customerId, input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customerKeys.history(customerId) }),
  });
}
