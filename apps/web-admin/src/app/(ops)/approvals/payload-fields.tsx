/**
 * What the request would actually do.
 *
 * A dual-control queue that shows only "manual posting, £4,300" is asking the second
 * operator to approve a category rather than a change. The payload the initiator
 * submitted is therefore rendered field by field, in the same words the form used, so the
 * approver checks the posting rather than the label on it.
 */

'use client';

import type { Money } from '@reliance/contracts';
import { MoneyText } from '@reliance/ui';

import { DetailField, DetailSection } from '@/components/shell/ops';
import { humaniseCode } from '@/lib/format';

/** Payload keys the queue already shows elsewhere, so they are not repeated here. */
const SUPPRESSED = new Set(['justification', 'amount']);

/** Payload keys as an operator would say them. */
const LABELS: Readonly<Record<string, string>> = {
  accountId: 'Customer account',
  direction: 'Direction',
  contraLedgerCode: 'Contra ledger account',
  narrative: 'Narrative',
  reason: 'Reason',
  loanId: 'Loan',
  cardId: 'Card',
};

function labelFor(key: string): string {
  return LABELS[key] ?? humaniseCode(key.replaceAll(/([a-z])([A-Z])/g, '$1_$2'));
}

/**
 * A payload value as a person would read it.
 *
 * Objects are the one case worth handling specially: a nested amount is the commonest,
 * and printing `[object Object]` in an approval queue is how a wrong posting gets waved
 * through.
 */
function describe(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value === '' ? '—' : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((item) => describe(item)).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return '—';
}

export interface PayloadFieldsProps {
  readonly payload: Readonly<Record<string, unknown>>;
  /** The request's headline amount, rendered as money rather than as text. */
  readonly amount: Money | null;
}

/** The submitted request, field by field. */
export function PayloadFields({ payload, amount }: PayloadFieldsProps) {
  const entries = Object.entries(payload).filter(([key]) => !SUPPRESSED.has(key));

  return (
    <DetailSection title="What this would do">
      {amount && (
        <DetailField label="Amount">
          <MoneyText amount={amount.amount} currency={amount.currency} size="sm" muted />
        </DetailField>
      )}
      {entries.map(([key, value]) => (
        <DetailField key={key} label={labelFor(key)} mono={key.endsWith('Id')}>
          {describe(value)}
        </DetailField>
      ))}
    </DetailSection>
  );
}
