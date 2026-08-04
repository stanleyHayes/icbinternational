/**
 * Global search.
 *
 * One box across customers, transactions, investigations and the console's own screens.
 * The three record searches are issued in parallel — sequencing them would make the
 * slowest one the cost of all three — and each is only issued if the operator's
 * permissions allow it, so a support agent's search never touches the monitoring queue
 * and never produces a result they would be refused when they clicked it.
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import type { ApiClient } from '@reliance/api-client';
import { Permission } from '@reliance/contracts';

import { useApiClient } from '@/lib/api-client';
import { usePermissions, type PermissionSet } from '@/lib/permissions';

import { visibleItems } from '../nav/nav-model';
import { NAV_SECTIONS } from '../nav/nav-sections';

import {
  caseResult,
  customerResult,
  navResult,
  transactionResult,
  type SearchResult,
} from './search-result';

/** Shorter than this and every customer in the bank matches. */
export const MIN_SEARCH_LENGTH = 2;

/** Results taken from each record source, so no single source floods the list. */
const PER_SOURCE_LIMIT = 6;

/** How many open cases are pulled back to be matched locally. See {@link searchCases}. */
const CASE_SCAN_LIMIT = 50;

/** How long a result set is reused if the operator retypes the same term. */
const SEARCH_STALE_TIME_MS = 30_000;

interface SearchInputs {
  readonly client: ApiClient;
  readonly term: string;
  readonly permissions: PermissionSet;
  readonly signal: AbortSignal;
}

async function searchCustomers({
  client,
  term,
  signal,
}: SearchInputs): Promise<readonly SearchResult[]> {
  const page = await client.admin.customers({ search: term, limit: PER_SOURCE_LIMIT }, { signal });
  return page.data.map(customerResult);
}

async function searchTransactions({
  client,
  term,
  signal,
}: SearchInputs): Promise<readonly SearchResult[]> {
  const page = await client.admin.transactions(
    { search: term, limit: PER_SOURCE_LIMIT },
    { signal },
  );
  return page.data.map(transactionResult);
}

/**
 * Investigations, filtered here rather than by the platform.
 *
 * The case endpoint takes no search term, so the console asks for a page and matches on
 * the reference and the customer's name. That is honest about being a narrow search over
 * open work rather than a search of the whole case history.
 */
async function searchCases({
  client,
  term,
  signal,
}: SearchInputs): Promise<readonly SearchResult[]> {
  const page = await client.admin.amlCases({ limit: CASE_SCAN_LIMIT }, { signal });
  const needle = term.toLowerCase();

  return page.data
    .filter(
      (investigation) =>
        investigation.reference.toLowerCase().includes(needle) ||
        investigation.customerName.toLowerCase().includes(needle),
    )
    .slice(0, PER_SOURCE_LIMIT)
    .map(caseResult);
}

function screenMatches(term: string, permissions: PermissionSet): SearchResult[] {
  const needle = term.toLowerCase();

  return visibleItems(NAV_SECTIONS, permissions)
    .filter(
      (item) =>
        item.label.toLowerCase().includes(needle) ||
        item.description.toLowerCase().includes(needle) ||
        (item.keywords ?? []).some((keyword) => keyword.includes(needle)),
    )
    .map(navResult);
}

async function runSearch(inputs: SearchInputs): Promise<readonly SearchResult[]> {
  const { permissions } = inputs;

  const sources: Promise<readonly SearchResult[]>[] = [];
  if (permissions.has(Permission.CUSTOMER_READ)) sources.push(searchCustomers(inputs));
  if (permissions.has(Permission.TRANSACTION_READ)) sources.push(searchTransactions(inputs));
  if (permissions.has(Permission.AML_READ)) sources.push(searchCases(inputs));

  const records = await Promise.all(sources);
  return [...records.flat(), ...screenMatches(inputs.term, permissions)];
}

/** What the palette knows at any moment. */
export interface GlobalSearchState {
  readonly results: readonly SearchResult[];
  readonly isSearching: boolean;
  readonly failed: boolean;
}

/**
 * Runs the search for a term.
 *
 * Screens are matched locally and appear the moment the operator types, so the palette is
 * never empty while the record searches are in flight.
 */
export function useGlobalSearch(term: string): GlobalSearchState {
  const client = useApiClient();
  const permissions = usePermissions();
  const trimmed = term.trim();
  const enabled = trimmed.length >= MIN_SEARCH_LENGTH;

  const query = useQuery({
    queryKey: ['admin', 'search', trimmed, permissions.granted],
    queryFn: ({ signal }) => runSearch({ client, term: trimmed, permissions, signal }),
    enabled,
    staleTime: SEARCH_STALE_TIME_MS,
  });

  if (!enabled) return { results: [], isSearching: false, failed: false };

  return {
    results: query.data ?? screenMatches(trimmed, permissions),
    isSearching: query.isFetching,
    failed: query.isError,
  };
}
