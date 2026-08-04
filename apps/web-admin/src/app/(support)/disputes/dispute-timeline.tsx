/**
 * How a dispute got to where it is.
 *
 * A chargeback moves through submitted, reviewed, evidence requested, represented,
 * sometimes arbitration, and finally won or lost — and the dates between those steps are
 * what a scheme or an ombudsman asks about. The timeline is rendered from the record's own
 * transitions rather than reconstructed, so what is on screen is what will be produced if
 * the case is ever questioned.
 */

'use client';

import type { Dispute } from '@reliance/contracts';
import { EmptyState, MoneyText, StatusPill } from '@reliance/ui';

import { disputeTone } from '@/components/compliance/kit';
import { formatInstant, humaniseCode } from '@/lib/format';

export interface DisputeTimelineProps {
  readonly dispute: Dispute;
}

function ProvisionalCreditNote({ dispute }: DisputeTimelineProps) {
  if (!dispute.provisionalCredit) {
    return (
      <p className="font-body text-fg-muted text-sm">
        No provisional credit has been given. The customer is out of pocket while this runs.
      </p>
    );
  }

  return (
    <p className="font-body text-fg-muted flex flex-wrap items-center gap-1.5 text-sm">
      Provisional credit of
      <MoneyText
        amount={dispute.provisionalCredit.amount}
        currency={dispute.provisionalCredit.currency}
      />
      was given on {formatInstant(dispute.provisionalCreditAt)}. Deciding against the customer takes
      it back.
    </p>
  );
}

/** The state transitions of one dispute, oldest first. */
export function DisputeTimeline({ dispute }: DisputeTimelineProps) {
  return (
    <div className="flex flex-col gap-3">
      <ProvisionalCreditNote dispute={dispute} />

      {dispute.timeline.length === 0 ? (
        <EmptyState
          title="Nothing recorded yet"
          description="This dispute has not moved since it was raised."
        />
      ) : (
        <ol className="flex flex-col">
          {dispute.timeline.map((step) => (
            <li
              key={`${step.at}-${step.status}`}
              className="border-border flex flex-wrap items-center gap-2 border-b py-2 last:border-0"
            >
              <span className="text-fg-subtle font-mono text-xs">{formatInstant(step.at)}</span>
              <StatusPill tone={disputeTone(step.status)} label={humaniseCode(step.status)} />
              <span className="font-body text-fg-muted text-sm">{step.detail}</span>
            </li>
          ))}
        </ol>
      )}

      {dispute.merchantResponse && (
        <Quote title="What the merchant said" body={dispute.merchantResponse} />
      )}

      {dispute.outcomeSummary && (
        <Quote title="Outcome given to the customer" body={dispute.outcomeSummary} />
      )}
    </div>
  );
}

function Quote({ title, body }: Readonly<{ title: string; body: string }>) {
  return (
    <div className="border-border bg-surface-sunken rounded-md border p-3">
      <h4 className="font-body text-fg-subtle text-xs font-semibold tracking-wider uppercase">
        {title}
      </h4>
      <p className="font-body text-fg mt-1 text-sm">{body}</p>
    </div>
  );
}
