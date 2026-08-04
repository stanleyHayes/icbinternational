/**
 * `/aml/rules` — monitoring and fraud rule tuning.
 */

import type { Metadata } from 'next';

import { RulesConsole } from '@/components/compliance/aml/rules-console';

export const metadata: Metadata = {
  title: 'Rule tuning',
};

/** The rule books, with backtesting. */
export default function RulesPage() {
  return <RulesConsole />;
}
