/**
 * The banner that says whose data is on screen.
 *
 * It is deliberately impossible to ignore: full width, high contrast, pinned below the
 * top bar, present for as long as a customer's record is open. An audit trail records
 * that an operator looked; this tells them, while they are looking, that the bank knows.
 * Those are different controls and a bank needs both.
 *
 * The stronger red state is for impersonation, where the operator is not merely reading
 * a record but standing inside the customer's own view of their money.
 */

'use client';

import { Eye, UserRoundCheck } from 'lucide-react';
import Link from 'next/link';

import { BANNER_TONE, cn, FOCUS_RING } from '@reliance/ui';

import { useCustomerSubjectValue, type CustomerSubject } from '@/lib/customer-context';
import { formatInstant, shortenId } from '@/lib/format';
import { href } from '@/lib/routes';

const CUSTOMER_SEARCH_PATH = '/customers';

const BAR = 'flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-1.5 font-body text-sm';

function ImpersonationDetail({ subject }: Readonly<{ subject: CustomerSubject }>) {
  const grant = subject.impersonation;
  if (!grant) return null;

  return (
    <span className="text-fg-muted">
      {grant.readOnly ? 'Read-only access' : 'Full access'} until {formatInstant(grant.expiresAt)}
    </span>
  );
}

/**
 * Renders nothing on a screen that is not showing an individual customer.
 *
 * A screen declares its subject with `useCustomerSubject`; this reads it.
 */
export function CustomerContextBanner() {
  const subject = useCustomerSubjectValue();
  if (!subject) return null;

  const impersonating = Boolean(subject.impersonation);
  const Icon = impersonating ? UserRoundCheck : Eye;

  return (
    <div
      role="status"
      className={cn(BAR, impersonating ? BANNER_TONE.danger : BANNER_TONE.warning)}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className="font-medium">
        {impersonating ? 'Acting as' : 'Viewing the records of'} {subject.name}
      </span>
      <span className="text-fg-muted font-mono text-xs">{shortenId(subject.id)}</span>
      <ImpersonationDetail subject={subject} />
      <span className="text-fg-muted">This access is recorded against your staff account.</span>
      <Link
        href={href(CUSTOMER_SEARCH_PATH)}
        className={cn('ml-auto rounded-sm font-medium underline underline-offset-2', FOCUS_RING)}
      >
        Close this record
      </Link>
    </div>
  );
}
