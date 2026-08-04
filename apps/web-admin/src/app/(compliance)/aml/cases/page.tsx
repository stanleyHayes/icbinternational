/**
 * `/aml/cases` — investigations.
 */

import type { Metadata } from 'next';

import { CaseConsole } from '@/components/compliance/aml/case-console';

export const metadata: Metadata = {
  title: 'Investigations',
};

/** The investigations list and case workspace. */
export default function CasesPage() {
  return <CaseConsole />;
}
