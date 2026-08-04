/**
 * The overview, assembled.
 *
 * Ordered the way the question is asked: does the book balance, what is arriving, what
 * is waiting on a person, and is anything downstream broken. Panels the operator's
 * permissions do not open render nothing at all rather than a row of refusals.
 */

'use client';

import { OpsScreen } from '@/components/ops';

import { AlertSummary } from './alert-summary';
import { HeadlineFigures } from './headline-figures';
import { LivePostings } from './live-postings';
import { QueueDepths } from './queue-depths';
import { RailSummary } from './rail-summary';

/** The operations overview. */
export function OverviewScreen() {
  return (
    <OpsScreen
      title="Operations overview"
      description="Balances, volumes, queue depths and counterparty health across the bank."
    >
      <HeadlineFigures />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <LivePostings />
        <div className="flex flex-col gap-4">
          <QueueDepths />
          <AlertSummary />
          <RailSummary />
        </div>
      </div>
    </OpsScreen>
  );
}
