/**
 * `/platform/audit` — the audit explorer.
 */

import type { Metadata } from 'next';

import { AuditScreen } from './audit-screen';

export const metadata: Metadata = {
  title: 'Audit trail',
  description: 'Every recorded change, with hash-chain verification.',
};

/** The audit explorer. */
export default function AuditPage() {
  return <AuditScreen />;
}
