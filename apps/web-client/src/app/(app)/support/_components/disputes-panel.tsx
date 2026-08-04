'use client';

/**
 * Disputes the customer has raised.
 *
 * A dispute has a regulated clock, so the decision deadline is on the row. "We need something from
 * you" is the status that costs somebody their case if they miss it, and it is worded to be
 * impossible to skim past.
 */

import { useQuery } from '@tanstack/react-query';

import type { Dispute } from '@reliance/contracts';
import { StatusPill } from '@reliance/ui';

import { EmptyPanel, LinkButton } from '@/components/shell';
import { laneRoutes, MoneyCell, movementKeys, QueryPanel, Section } from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { formatDate } from '@/lib/format';

import { DISPUTE_STATUS } from './support-look';

const NEW_DISPUTE = <LinkButton href={laneRoutes.support.newDispute}>Dispute a payment</LinkButton>;

const NO_DISPUTES = (
  <EmptyPanel
    title="No disputes"
    description="If a payment on your account is wrong — you did not make it, you were charged twice, or what you paid for never arrived — you can dispute it and we will investigate."
    action={NEW_DISPUTE}
  />
);

function DisputeRow({ dispute }: { readonly dispute: Dispute }) {
  const status = DISPUTE_STATUS[dispute.status];

  return (
    <li className="border-border flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-0">
      <span className="min-w-0">
        <span className="text-fg block truncate text-sm font-medium">{dispute.description}</span>
        <span className="text-fg-muted mt-0.5 block text-xs">
          Raised {formatDate(dispute.createdAt)} · decision due by{' '}
          {formatDate(dispute.decisionDueAt)}
        </span>
        {dispute.provisionalCredit ? (
          <span className="text-fg-subtle mt-1 block text-xs">
            <MoneyCell
              money={dispute.provisionalCredit}
              size="sm"
              muted
              srLabel="Credited while we look into it"
            />{' '}
            credited to you while we investigate
          </span>
        ) : null}
      </span>

      <span className="flex shrink-0 items-center gap-3">
        <StatusPill tone={status.tone} label={status.label} />
        <MoneyCell money={dispute.disputedAmount} srLabel="Amount disputed" />
      </span>
    </li>
  );
}

/**
 * @example <DisputesPanel />
 */
export function DisputesPanel() {
  const disputes = useQuery({
    queryKey: movementKeys.support.disputes(),
    queryFn: async () => (await browserApi().support.listDisputes()).data,
  });

  return (
    <Section
      title="Disputes"
      description="Payments you have asked us to investigate."
      action={NEW_DISPUTE}
    >
      <QueryPanel
        query={disputes}
        skeletonRows={2}
        isEmpty={(list) => list.length === 0}
        empty={NO_DISPUTES}
      >
        {(list) => (
          <ul className="flex flex-col">
            {list.map((dispute) => (
              <DisputeRow key={dispute.id} dispute={dispute} />
            ))}
          </ul>
        )}
      </QueryPanel>
    </Section>
  );
}
