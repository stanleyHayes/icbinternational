/**
 * The signed-in operator.
 *
 * The console asks the platform who is signed in rather than trusting anything it was
 * handed at sign-in. The session cookie is httpOnly and the permission list is resolved
 * server-side from the operator's roles, so this query is the only honest answer to
 * "what may this person do", and it is re-asked whenever the tab regains focus.
 */

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import type { AdminUser } from '@reliance/contracts';

import { useApiClient } from '@/lib/api-client';
import { isSessionFailure } from '@/lib/errors';

/** Query key for the signed-in operator. Exported so a screen can invalidate it. */
export const SESSION_QUERY_KEY = ['admin', 'session'] as const;

/** How long the resolved identity is trusted before it is re-checked. */
const SESSION_STALE_TIME_MS = 60_000;

/** What the console knows about the current operator. */
export interface AdminSessionState {
  /** The operator, or `null` when there is no usable session. */
  readonly operator: AdminUser | null;
  /** True until the first answer arrives. Distinguish from "signed out". */
  readonly isResolving: boolean;
  /** True when the identity check itself failed for a reason other than being signed out. */
  readonly isUnavailable: boolean;
  /** Ends the session on the platform and clears every cached query. */
  readonly signOut: () => void;
  /** True while the sign-out request is in flight. */
  readonly isSigningOut: boolean;
}

const SessionContext = createContext<AdminSessionState | null>(null);

/** Resolves the operator and shares the result with the whole console. */
export function AdminSessionProvider({ children }: Readonly<{ children: ReactNode }>) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: async ({ signal }) => (await client.admin.me({ signal })).data,
    // A signed-out operator is an answer, not a failure worth retrying.
    retry: false,
    staleTime: SESSION_STALE_TIME_MS,
  });

  const signOutMutation = useMutation({
    mutationFn: () => client.auth.logout(),
    // Whether or not the platform acknowledged, this tab must forget everything it holds:
    // queue contents and customer records are exactly what must not outlive the session.
    onSettled: () => queryClient.clear(),
  });

  const value = useMemo<AdminSessionState>(
    () => ({
      operator: query.data ?? null,
      isResolving: query.isPending,
      isUnavailable: query.isError && !isSessionFailure(query.error),
      signOut: () => signOutMutation.mutate(),
      isSigningOut: signOutMutation.isPending,
    }),
    [query.data, query.isPending, query.isError, query.error, signOutMutation],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/**
 * The current operator and the controls around the session.
 *
 * @throws {Error} when called outside {@link AdminSessionProvider}.
 */
export function useAdminSession(): AdminSessionState {
  const state = useContext(SessionContext);
  if (!state) throw new Error('useAdminSession must be used inside AdminSessionProvider.');
  return state;
}
