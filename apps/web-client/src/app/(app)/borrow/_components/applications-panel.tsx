'use client';

/**
 * Applications in flight.
 *
 * Only shown when there are any, because an empty "your applications" panel on the borrowing
 * screen implies the customer has applied for something and been forgotten. An offer that is
 * waiting is called out, with the deadline, since offers expire.
 */

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import type { LoanApplication } from '@reliance/contracts';
import { cn, StatusPill } from '@reliance/ui';

import { laneRoutes, MoneyCell, movementKeys, QueryPanel, Section } from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { formatDate } from '@/lib/format';

import { APPLICATION_STATUS, OFFER_OPEN } from './lending-look';

/** What the row says under the product name. */
function progressLine(application: LoanApplication): string {
  if (OFFER_OPEN.has(application.status) && application.offerExpiresAt) {
    return `Offer open until ${formatDate(application.offerExpiresAt)}`;
  }
  if (application.submittedAt) return `Applied ${formatDate(application.submittedAt)}`;
  return `Started ${formatDate(application.createdAt)}`;
}

function ApplicationRow({ application }: { readonly application: LoanApplication }) {
  const status = APPLICATION_STATUS[application.status];

  return (
    <li>
      <Link
        href={laneRoutes.borrow.application(application.id)}
        className={cn(
          'hover:bg-surface-sunken flex items-center justify-between gap-3 rounded-md px-3 py-3',
          'focus-visible:ring-focus focus-visible:ring-2 focus-visible:outline-none',
        )}
      >
        <span className="min-w-0">
          <span className="text-fg block truncate text-sm font-medium">{application.purpose}</span>
          <span className="text-fg-muted mt-0.5 block text-xs">{progressLine(application)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <StatusPill tone={status.tone} label={status.label} />
          <MoneyCell money={application.requestedAmount} srLabel="Amount applied for" />
        </span>
      </Link>
    </li>
  );
}

/**
 * @example <ApplicationsPanel />
 */
export function ApplicationsPanel() {
  const applications = useQuery({
    queryKey: movementKeys.borrow.applications(),
    queryFn: async () => (await browserApi().borrow.listApplications()).data,
  });

  if (applications.data?.length === 0) return null;

  return (
    <Section title="Your applications" description="Where each one has got to.">
      <QueryPanel query={applications} skeletonRows={1}>
        {(list) => (
          <ul className="divide-border -mx-3 flex flex-col divide-y">
            {list.map((application) => (
              <ApplicationRow key={application.id} application={application} />
            ))}
          </ul>
        )}
      </QueryPanel>
    </Section>
  );
}
