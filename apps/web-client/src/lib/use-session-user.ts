'use client';

/**
 * The signed-in customer, in the browser.
 *
 * One query, one cache key, so the avatar in the top bar, the greeting on the dashboard and the
 * limits notice on a transfer screen are all reading the same record and cannot show three
 * different names. Feature screens should call this rather than fetching `auth.me` again.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { User } from '@reliance/contracts';

import { browserApi } from './api';
import { queryKeys } from './query-keys';

/** The customer's full name, as the bank addresses them. */
export function fullName(user: Pick<User, 'firstName' | 'lastName'>): string {
  return `${user.firstName} ${user.lastName}`.trim();
}

/**
 * The signed-in customer.
 *
 * Never retried on failure: the only interesting failure is "the session ended", and the client's
 * own refresh has already had its one attempt by the time this rejects.
 */
export function useSessionUser(): UseQueryResult<User> {
  return useQuery({
    queryKey: queryKeys.session,
    queryFn: async () => (await browserApi().auth.me()).data,
    retry: false,
  });
}
