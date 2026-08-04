/**
 * What a search result looks like, and how each kind of record becomes one.
 *
 * Every result carries the same three things: what it is, enough detail to tell it apart
 * from its neighbours, and where it goes. The detail line matters more than it sounds —
 * six customers called "J Bennett" are indistinguishable without one, and picking the
 * wrong one means opening a stranger's account.
 */

import { FileText, Receipt, UserRound, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import type { AmlCase, Transaction, User } from '@reliance/contracts';
import { MoneyText, StatusPill } from '@reliance/ui';

import { formatDate, humaniseCode, shortenId } from '@/lib/format';

import type { NavItem } from '../nav/nav-model';

/** Heading a result is filed under in the palette. */
export type SearchGroup = 'Go to' | 'Customers' | 'Transactions' | 'Investigations';

/** One row in the command palette. */
export interface SearchResult {
  /** Stable React key, unique across every group. */
  readonly key: string;
  readonly group: SearchGroup;
  readonly title: string;
  /** The line that tells two similar results apart. */
  readonly detail: ReactNode;
  readonly path: string;
  readonly icon: LucideIcon;
}

/** A console screen, so the palette navigates as well as searches. */
export function navResult(item: NavItem): SearchResult {
  return {
    key: `nav:${item.id}`,
    group: 'Go to',
    title: item.label,
    detail: item.description,
    path: item.path,
    icon: item.icon,
  };
}

/** A customer record. */
export function customerResult(customer: User): SearchResult {
  return {
    key: `customer:${customer.id}`,
    group: 'Customers',
    title: `${customer.firstName} ${customer.lastName}`,
    detail: (
      <span className="flex items-center gap-2">
        <span className="truncate">{customer.email}</span>
        <span className="font-mono text-xs">{shortenId(customer.id)}</span>
        <StatusPill label={humaniseCode(customer.status)} tone="neutral" />
      </span>
    ),
    path: `/customers/${customer.id}`,
    icon: UserRound,
  };
}

/** A posting on a customer account. */
export function transactionResult(transaction: Transaction): SearchResult {
  return {
    key: `transaction:${transaction.id}`,
    group: 'Transactions',
    title: transaction.description,
    detail: (
      <span className="flex items-center gap-2">
        <MoneyText
          amount={transaction.amount.amount}
          currency={transaction.amount.currency}
          size="sm"
          signed
        />
        <span>{formatDate(transaction.bookedAt)}</span>
        <span className="font-mono text-xs">{shortenId(transaction.id)}</span>
      </span>
    ),
    path: `/transactions/${transaction.id}`,
    icon: Receipt,
  };
}

/** An investigation case. */
export function caseResult(investigation: AmlCase): SearchResult {
  return {
    key: `case:${investigation.id}`,
    group: 'Investigations',
    title: investigation.reference,
    detail: (
      <span className="flex items-center gap-2">
        <span className="truncate">{investigation.customerName}</span>
        <StatusPill label={humaniseCode(investigation.severity)} tone="warning" />
        <span>opened {formatDate(investigation.openedAt)}</span>
      </span>
    ),
    path: `/aml/cases/${investigation.id}`,
    icon: FileText,
  };
}

/** Groups results in the order the palette presents them. */
export function groupResults(
  results: readonly SearchResult[],
): readonly (readonly [SearchGroup, readonly SearchResult[]])[] {
  const order: readonly SearchGroup[] = ['Customers', 'Transactions', 'Investigations', 'Go to'];
  return order
    .map((group) => [group, results.filter((result) => result.group === group)] as const)
    .filter(([, items]) => items.length > 0);
}
