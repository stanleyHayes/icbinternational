'use client';

/**
 * Payments the customer has already sent.
 *
 * Sits beside the send flow rather than on a page of its own, because "did that one go?" is the
 * question people arrive on this screen with almost as often as "send another". Status carries a
 * pill *and* a word; the amount carries a sign; nothing here depends on colour alone.
 */

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import type { Transfer } from '@reliance/contracts';
import { cn, MoneyText, StatusPill } from '@reliance/ui';

import { EmptyPanel } from '@/components/shell';
import {
  describeDestination,
  laneRoutes,
  movementKeys,
  QueryPanel,
  Section,
  TRANSFER_STATUS,
} from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { relativeTime } from '@/lib/format';

const RECENT_LIMIT = 6;

function Row({ transfer }: { readonly transfer: Transfer }) {
  const status = TRANSFER_STATUS[transfer.status];

  return (
    <li>
      <Link
        href={laneRoutes.transfers.detail(transfer.id)}
        className={cn(
          'hover:bg-surface-sunken flex items-center justify-between gap-3 rounded-md px-3 py-2.5',
          'focus-visible:ring-focus focus-visible:ring-2 focus-visible:outline-none',
        )}
      >
        <span className="min-w-0">
          <span className="text-fg block truncate text-sm font-medium">
            {describeDestination(transfer.destination)}
          </span>
          <span className="text-fg-muted mt-0.5 block text-xs">
            {relativeTime(transfer.createdAt)}
            {transfer.reference ? ` · ${transfer.reference}` : ''}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <StatusPill tone={status.tone} label={status.label} />
          <MoneyText
            amount={`-${transfer.debitAmount.amount}`}
            currency={transfer.debitAmount.currency}
            signed
            srLabel="Amount sent"
          />
        </span>
      </Link>
    </li>
  );
}

const NOTHING_SENT = (
  <EmptyPanel
    title="You have not sent anything yet"
    description="Payments you make will appear here with their status and a receipt you can share."
  />
);

const SCHEDULED_LINK = (
  <Link
    href={laneRoutes.scheduled.index}
    className="text-accent text-sm font-medium hover:underline"
  >
    Scheduled payments
  </Link>
);

/** The customer's most recent payments, newest first. */
export function RecentTransfers() {
  const filters = { limit: RECENT_LIMIT };
  const transfers = useQuery({
    queryKey: movementKeys.transfers.list(filters),
    queryFn: async () => (await browserApi().transfers.list(filters)).data,
  });

  return (
    <Section
      title="Payments you have sent"
      description="The last few, newest first."
      action={SCHEDULED_LINK}
    >
      <QueryPanel
        query={transfers}
        skeletonRows={3}
        isEmpty={(list) => list.length === 0}
        empty={NOTHING_SENT}
      >
        {(list) => (
          <ul className="-mx-3 flex flex-col">
            {list.map((transfer) => (
              <Row key={transfer.id} transfer={transfer} />
            ))}
          </ul>
        )}
      </QueryPanel>
    </Section>
  );
}
