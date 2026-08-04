/**
 * `/aml/alerts` — the transaction-monitoring queue.
 */

import type { Metadata } from 'next';

import { AlertQueue } from '@/components/compliance/aml/alert-queue';

export const metadata: Metadata = {
  title: 'Monitoring alerts',
};

/** The monitoring alert queue and triage panel. */
export default function AlertsPage() {
  return <AlertQueue />;
}
