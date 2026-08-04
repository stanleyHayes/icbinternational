/**
 * `/kyc` — the identity-review workstation.
 */

import type { Metadata } from 'next';

import { KycWorkstation } from '@/components/compliance/kyc/kyc-workstation';

export const metadata: Metadata = {
  title: 'Identity review',
};

/** The identity-review queue and case workstation. */
export default function KycPage() {
  return <KycWorkstation />;
}
