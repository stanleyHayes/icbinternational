/**
 * `/approvals` — the dual-control queue.
 */

import type { Metadata } from 'next';

import { ApprovalsScreen } from './approvals-screen';

export const metadata: Metadata = {
  title: 'Approvals',
  description: 'Manual postings, reversals and overrides awaiting a second approver.',
};

/** The dual-control queue. */
export default function ApprovalsPage() {
  return <ApprovalsScreen />;
}
