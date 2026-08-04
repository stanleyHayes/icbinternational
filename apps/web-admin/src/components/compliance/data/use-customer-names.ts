/**
 * Putting a name to a customer identifier.
 *
 * An identity case carries only a `usr_…`, and a queue of those is unworkable: an analyst
 * cannot tell two cases apart, cannot search for the one a colleague mentioned, and
 * cannot sanity-check that the document they are looking at belongs to the case they
 * opened. So the queue resolves the names once and looks them up.
 *
 * A name that cannot be resolved is left as the identifier rather than blanked. An empty
 * cell reads as "this customer has no name", which is a different and much more alarming
 * claim than "we have not loaded it".
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { CONSOLE_KEY, QUEUE_PAGE_SIZE, queueQueryOptions } from '@/components/compliance/kit';
import { useApiClient } from '@/lib/api-client';

/** How a customer is identified on a queue row. */
export interface CustomerLabel {
  readonly name: string;
  readonly email: string;
}

/** Names and email addresses, keyed by customer identifier. */
export function useCustomerNames() {
  const client = useApiClient();

  return useQuery({
    queryKey: [CONSOLE_KEY, 'customers', 'labels'],
    queryFn: async ({ signal }): Promise<ReadonlyMap<string, CustomerLabel>> => {
      const page = await client.admin.customers({ limit: QUEUE_PAGE_SIZE }, { signal });
      return new Map(
        page.data.map((customer) => [
          customer.id,
          { name: `${customer.firstName} ${customer.lastName}`, email: customer.email },
        ]),
      );
    },
    ...queueQueryOptions,
  });
}

/** The customer's name, or their identifier when it has not been resolved. */
export function labelFor(
  labels: ReadonlyMap<string, CustomerLabel> | undefined,
  customerId: string,
): string {
  return labels?.get(customerId)?.name ?? customerId;
}
