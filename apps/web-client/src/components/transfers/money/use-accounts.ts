'use client';

/**
 * The accounts a payment can come out of.
 *
 * Every money screen in the application needs the same list and the same three questions answered:
 * which accounts are usable, which one should be selected first, and what currency is the one
 * chosen account denominated in. Fetched under the shell's `queryKeys.accounts.list()` so the
 * dashboard, the account switcher and a transfer form all read one cached copy.
 *
 * Closed, closing and pending accounts are filtered out. Offering a source account that will
 * refuse the debit is a form that fails on submit for a reason the customer could not have known.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { AccountStatus, type Account } from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';
import type { SelectOption } from '@reliance/ui';

import { browserApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

/** Statuses that can still take a debit or a credit. */
const USABLE: ReadonlySet<AccountStatus> = new Set([AccountStatus.ACTIVE, AccountStatus.DORMANT]);

async function fetchAccounts(): Promise<Account[]> {
  return (await browserApi().accounts.list()).data;
}

/** Every account the customer holds, each with its balance projection. */
export function useAccounts(): UseQueryResult<Account[]> {
  return useQuery({ queryKey: queryKeys.accounts.list(), queryFn: fetchAccounts });
}

/**
 * The accounts a payment may be funded from or paid into.
 *
 * Narrowed with `select` rather than a second request, so both hooks share one cache entry and the
 * balance a transfer form shows is the balance the dashboard shows.
 */
export function useUsableAccounts(): UseQueryResult<Account[]> {
  return useQuery({
    queryKey: queryKeys.accounts.list(),
    queryFn: fetchAccounts,
    select: (accounts) => accounts.filter((account) => USABLE.has(account.status)),
  });
}

/** Digits of an account number shown in a label. Enough to recognise, not enough to reuse. */
const VISIBLE_DIGITS = 4;

/** How an account reads in a picker: the customer's name for it, then what it holds. */
export function accountLabel(account: Account): string {
  const name = account.nickname ?? account.productName;
  return `${name} · ${account.currency} · ends ${account.number.slice(-VISIBLE_DIGITS)}`;
}

/** Turns accounts into `<Select>` options, in the order the bank lists them. */
export function accountOptions(accounts: readonly Account[]): SelectOption[] {
  return accounts.map((account) => ({ value: account.id, label: accountLabel(account) }));
}

/** The account with the given id, or the customer's primary one when nothing is chosen yet. */
export function resolveAccount(
  accounts: readonly Account[] | undefined,
  accountId: string | null,
): Account | undefined {
  if (!accounts || accounts.length === 0) return undefined;
  return (
    accounts.find((account) => account.id === accountId) ??
    accounts.find((account) => account.isPrimary) ??
    accounts[0]
  );
}

/** The currency of the chosen account, defaulting to the first account's while one loads. */
export function currencyOf(account: Account | undefined, fallback: CurrencyCode): CurrencyCode {
  return account?.currency ?? fallback;
}
