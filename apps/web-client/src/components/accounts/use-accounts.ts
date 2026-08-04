'use client';

/**
 * Reading and changing accounts.
 *
 * Every mutation here invalidates `queryKeys.accounts.all` rather than the one record it touched.
 * Renaming an account changes the label in the switcher, on the dashboard cards, in the payment
 * source list and in the transaction filter; closing one changes the net-worth figure. Pruning
 * the invalidation to the detail query would leave four screens quietly stale, and a stale
 * balance is the one thing a bank must never show.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import type {
  Account,
  CloseAccountRequest,
  OpenAccountRequest,
  Product,
  RequestStatement,
  Statement,
  UpdateAccountRequest,
} from '@reliance/contracts';

import { browserApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

/** Statements are archived monthly, so a couple of years fits in one page. */
const STATEMENT_PAGE_SIZE = 36;

/** The product catalogue is short and changes rarely. */
const PRODUCT_PAGE_SIZE = 50;

/** Cache key for an account's statement archive. */
function statementsKey(accountId: string) {
  return [...queryKeys.accounts.detail(accountId), 'statements'] as const;
}

/** Every account the customer holds, open and closed. */
export function useAccounts(): UseQueryResult<readonly Account[]> {
  return useQuery({
    queryKey: queryKeys.accounts.list(),
    queryFn: async () => (await browserApi().accounts.list()).data,
  });
}

/** One account, with its balance projection. */
export function useAccount(accountId: string): UseQueryResult<Account> {
  return useQuery({
    queryKey: queryKeys.accounts.detail(accountId),
    queryFn: async () => (await browserApi().accounts.get(accountId)).data,
  });
}

/** The aggregate position, in the customer's base currency. */
export function useNetWorth() {
  return useQuery({
    queryKey: queryKeys.accounts.netWorth(),
    queryFn: async () => (await browserApi().accounts.netWorth()).data,
  });
}

/** Statements already produced for an account, newest first. */
export function useStatements(accountId: string): UseQueryResult<readonly Statement[]> {
  return useQuery({
    queryKey: statementsKey(accountId),
    queryFn: async () =>
      (await browserApi().accounts.listStatements(accountId, { limit: STATEMENT_PAGE_SIZE })).data,
  });
}

/** Accounts the customer could open, with their rates, fees and limits. */
export function useProducts(): UseQueryResult<readonly Product[]> {
  return useQuery({
    queryKey: ['products', 'openable'],
    queryFn: async () => (await browserApi().public.products({ limit: PRODUCT_PAGE_SIZE })).data,
  });
}

/** Invalidates everything derived from an account: balances, lists and the net-worth figure. */
function useAccountInvalidation(): () => Promise<void> {
  const cache = useQueryClient();
  return async () => {
    await cache.invalidateQueries({ queryKey: queryKeys.accounts.all });
  };
}

/** Opens an account against a product code. */
export function useOpenAccount(): UseMutationResult<Account, unknown, OpenAccountRequest> {
  const invalidate = useAccountInvalidation();

  return useMutation({
    mutationFn: async (body: OpenAccountRequest) => (await browserApi().accounts.create(body)).data,
    onSuccess: invalidate,
  });
}

/** Renames an account, or makes it the one the app opens on. */
export function useUpdateAccount(
  accountId: string,
): UseMutationResult<Account, unknown, UpdateAccountRequest> {
  const invalidate = useAccountInvalidation();

  return useMutation({
    mutationFn: async (body: UpdateAccountRequest) =>
      (await browserApi().accounts.update(accountId, body)).data,
    onSuccess: invalidate,
  });
}

/** Closes an account, sweeping any residual balance to another one first. */
export function useCloseAccount(
  accountId: string,
): UseMutationResult<Account, unknown, CloseAccountRequest> {
  const invalidate = useAccountInvalidation();

  return useMutation({
    mutationFn: async (body: CloseAccountRequest) =>
      (await browserApi().accounts.close(accountId, body)).data,
    onSuccess: invalidate,
  });
}

/** Asks for a statement covering a date range the customer chooses. */
export function useRequestStatement(
  accountId: string,
): UseMutationResult<Statement, unknown, RequestStatement> {
  const cache = useQueryClient();

  return useMutation({
    mutationFn: async (body: RequestStatement) =>
      (await browserApi().accounts.requestStatement(accountId, body)).data,
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: statementsKey(accountId) });
    },
  });
}
