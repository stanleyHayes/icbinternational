/**
 * Everything the bank holds on one customer, assembled from the record's own identifiers.
 *
 * The important rule in this file is how a record is decided to belong to the customer.
 * Every association is made from a field on the record itself — an account's `userId`, a
 * card's `accountId` matched against that customer's accounts, an alert's `userId`. None
 * of it is inferred from the order a list arrived in or from a filter the console asked
 * for and trusted.
 *
 * That is not tidiness. A customer-360 screen that shows one row belonging to somebody
 * else has disclosed another person's banking to a member of staff, and the failure looks
 * exactly like a correct screen. Filtering on the record's own foreign key means the
 * worst case is a section that is empty when it should not be, which is visible and
 * harmless, rather than one that is populated when it should not be.
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import type { Account, Card, Hold, Transaction } from '@reliance/contracts';

import { QUEUE_PAGE_SIZE, queueQueryOptions } from '@/components/compliance/kit';
import { useApiClient } from '@/lib/api-client';

import { customerKeys } from './keys';

/** Postings read per account when the activity tab opens. */
const POSTINGS_PER_ACCOUNT = 50;

/** Accounts the platform reports as belonging to this customer, and nobody else. */
export function useCustomerAccounts(customerId: string) {
  const client = useApiClient();

  return useQuery({
    queryKey: customerKeys.accounts(customerId),
    queryFn: async ({ signal }): Promise<readonly Account[]> => {
      const page = await client.accounts.list(undefined, { signal });
      return page.data.filter((account) => account.userId === customerId);
    },
    ...queueQueryOptions,
  });
}

/** Sorts newest posting first, which is the order an operator reads activity in. */
function byBookedAtDescending(left: Transaction, right: Transaction): number {
  return right.bookedAt.localeCompare(left.bookedAt);
}

/** Postings across every account the customer holds, newest first. */
export function useCustomerPostings(customerId: string, accountIds: readonly string[]) {
  const client = useApiClient();

  return useQuery({
    queryKey: [...customerKeys.postings(customerId), accountIds],
    enabled: accountIds.length > 0,
    queryFn: async ({ signal }): Promise<readonly Transaction[]> => {
      const pages = await Promise.all(
        accountIds.map((accountId) =>
          client.admin.transactions({ accountId, limit: POSTINGS_PER_ACCOUNT }, { signal }),
        ),
      );
      return pages.flatMap((page) => page.data).sort(byBookedAtDescending);
    },
    ...queueQueryOptions,
  });
}

/** Cards issued against the customer's accounts. */
export function useCustomerCards(customerId: string, accountIds: readonly string[]) {
  const client = useApiClient();

  return useQuery({
    queryKey: [...customerKeys.cards(customerId), accountIds],
    enabled: accountIds.length > 0,
    queryFn: async ({ signal }): Promise<readonly Card[]> => {
      const owned = new Set(accountIds);
      const page = await client.admin.cards({ limit: QUEUE_PAGE_SIZE }, { signal });
      return page.data.filter((card) => owned.has(card.accountId));
    },
    ...queueQueryOptions,
  });
}

/** Liens and authorisations reducing what the customer can spend. */
export function useCustomerHolds(customerId: string, accountIds: readonly string[]) {
  const client = useApiClient();

  return useQuery({
    queryKey: [...customerKeys.holds(customerId), accountIds],
    enabled: accountIds.length > 0,
    queryFn: async ({ signal }): Promise<readonly Hold[]> => {
      const owned = new Set(accountIds);
      const page = await client.admin.holds({ limit: QUEUE_PAGE_SIZE }, { signal });
      return page.data.filter((hold) => owned.has(hold.accountId));
    },
    ...queueQueryOptions,
  });
}

/**
 * The customer's slice of the audit chain.
 *
 * Asked for by `entityId` so it returns what was done *to* this customer — including the
 * reads. Every operator who has opened this record appears here, which is the point: the
 * customer can be told who looked and why.
 */
export function useCustomerHistory(customerId: string) {
  const client = useApiClient();

  return useQuery({
    queryKey: customerKeys.history(customerId),
    queryFn: async ({ signal }) =>
      (await client.admin.audit({ entityId: customerId, limit: QUEUE_PAGE_SIZE }, { signal })).data,
    ...queueQueryOptions,
  });
}
