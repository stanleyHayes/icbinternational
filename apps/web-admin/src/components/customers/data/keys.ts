/**
 * Cache keys for everything the customer record reads.
 *
 * Written out here rather than inline at each `useQuery` so an action can invalidate
 * precisely what it changed. Freezing a customer must refresh that customer and the
 * search results that show their status, and nothing else — invalidating the whole
 * console after every mutation would re-fetch nine queues an operator is not looking at.
 */

import { CONSOLE_KEY } from '@/components/compliance/kit';

const CUSTOMERS = 'customers' as const;

/** Query keys for the customer search and the customer record. */
export const customerKeys = {
  /** Everything under the customer lane — the broadest invalidation there is. */
  all: [CONSOLE_KEY, CUSTOMERS] as const,
  /** One page of search results. */
  search: (filters: Readonly<Record<string, string>>) =>
    [CONSOLE_KEY, CUSTOMERS, 'search', filters] as const,
  /** One customer's own record. */
  detail: (customerId: string) => [CONSOLE_KEY, CUSTOMERS, 'detail', customerId] as const,
  /** The customer's accounts, and everything hanging off them. */
  accounts: (customerId: string) => [CONSOLE_KEY, CUSTOMERS, 'accounts', customerId] as const,
  /** Cards issued against the customer's accounts. */
  cards: (customerId: string) => [CONSOLE_KEY, CUSTOMERS, 'cards', customerId] as const,
  /** Liens and authorisations against the customer's accounts. */
  holds: (customerId: string) => [CONSOLE_KEY, CUSTOMERS, 'holds', customerId] as const,
  /** Postings across every account the customer holds. */
  postings: (customerId: string) => [CONSOLE_KEY, CUSTOMERS, 'postings', customerId] as const,
  /** The customer's slice of the audit chain. */
  history: (customerId: string) => [CONSOLE_KEY, CUSTOMERS, 'history', customerId] as const,
  /** Risk records — identity case, screening hits, alerts and investigations. */
  risk: (customerId: string) => [CONSOLE_KEY, CUSTOMERS, 'risk', customerId] as const,
  /** Support tickets and disputes attributable to the customer. */
  contacts: (customerId: string) => [CONSOLE_KEY, CUSTOMERS, 'contacts', customerId] as const,
};
