/**
 * `/finance/reports` — the bank's financial reporting.
 */

import type { Metadata } from 'next';

import { ReportsScreen } from './reports-screen';

export const metadata: Metadata = {
  title: 'Financial reports',
  description: 'Profit and loss, balance sheet, reconciliation and the reporting calendar.',
};

/** Financial reporting. */
export default function ReportsPage() {
  return <ReportsScreen />;
}
