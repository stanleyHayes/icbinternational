/**
 * `/transactions` — transaction operations.
 */

import type { Metadata } from 'next';

import { TransactionsScreen } from './transactions-screen';

export const metadata: Metadata = {
  title: 'Transactions',
  description: 'Search postings, inspect journal entries and reconcile against the rails.',
};

/** Transaction operations. */
export default function TransactionsPage() {
  return <TransactionsScreen />;
}
