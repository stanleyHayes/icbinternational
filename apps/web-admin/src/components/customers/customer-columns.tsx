/**
 * The columns of the customer search.
 *
 * The name is a link rather than the row being clickable. An operator scanning a queue
 * with the keyboard needs to reach the record with Tab and Enter, and a row-level click
 * handler gives them nothing to focus; it also makes selecting a customer's email to
 * paste into a ticket open the record instead.
 *
 * Verification is shown as words, never as a green tick alone — "email unverified" is a
 * fraud signal, and a missing tick reads as an absence rather than a fact.
 */

'use client';

import Link from 'next/link';

import type { User } from '@reliance/contracts';
import { Badge, cn, FOCUS_RING, StatusPill } from '@reliance/ui';

import { customerTone } from '@/components/compliance/kit';
import type { DataColumn } from '@/components/shell/ops';
import { formatInstant, humaniseCode } from '@/lib/format';
import { href } from '@/lib/routes';

/** Where one customer's record lives. */
export function customerPath(customerId: string): string {
  return `/customers/${customerId}`;
}

/** The customer's name as the bank holds it. */
export function fullName(customer: User): string {
  return `${customer.firstName} ${customer.lastName}`;
}

const NAME_LINK = 'font-body text-sm font-medium text-accent underline-offset-2 hover:underline';

function VerificationNote({ customer }: Readonly<{ customer: User }>) {
  const unverified: string[] = [];
  if (!customer.emailVerified) unverified.push('email');
  if (customer.phone && !customer.phoneVerified) unverified.push('phone');
  if (unverified.length === 0) return null;

  return (
    <span className="font-body text-warning text-xs">Unverified {unverified.join(' and ')}</span>
  );
}

function tierLabel(tier: number): string {
  return `Tier ${tier}`;
}

/** Columns for the customer search table. */
export const CUSTOMER_COLUMNS: readonly DataColumn<User>[] = [
  {
    id: 'name',
    header: 'Customer',
    alwaysVisible: true,
    cell: (customer) => (
      <span className="flex flex-col">
        <Link href={href(customerPath(customer.id))} className={cn(NAME_LINK, FOCUS_RING)}>
          {fullName(customer)}
        </Link>
        <span className="font-body text-fg-muted text-xs">{customer.email}</span>
        <VerificationNote customer={customer} />
      </span>
    ),
    csv: (customer) => `${fullName(customer)} <${customer.email}>`,
    sortValue: (customer) => `${customer.lastName} ${customer.firstName}`,
  },
  {
    id: 'status',
    header: 'Status',
    cell: (customer) => (
      <StatusPill tone={customerTone(customer.status)} label={humaniseCode(customer.status)} />
    ),
    csv: (customer) => humaniseCode(customer.status),
  },
  {
    id: 'segment',
    header: 'Segment',
    cell: (customer) => <Badge>{humaniseCode(customer.segment)}</Badge>,
    csv: (customer) => humaniseCode(customer.segment),
  },
  {
    id: 'tier',
    header: 'Verification',
    cell: (customer) => (
      <span className="font-body text-fg text-sm">{tierLabel(customer.kycTier)}</span>
    ),
    csv: (customer) => tierLabel(customer.kycTier),
    sortValue: (customer) => customer.kycTier,
  },
  {
    id: 'mfa',
    header: 'Second factor',
    cell: (customer) => (
      <span className="font-body text-fg-muted text-sm">
        {customer.mfaEnabled ? customer.mfaMethods.map(humaniseCode).join(', ') : 'Not enrolled'}
      </span>
    ),
    csv: (customer) => (customer.mfaEnabled ? customer.mfaMethods.join(' ') : 'Not enrolled'),
  },
  {
    id: 'phone',
    header: 'Telephone',
    cell: (customer) => (
      <span className="text-fg-muted font-mono text-xs">{customer.phone ?? 'Not given'}</span>
    ),
    csv: (customer) => customer.phone ?? 'Not given',
  },
  {
    id: 'lastLogin',
    header: 'Last signed in',
    cell: (customer) => (
      <span className="text-fg-muted font-mono text-xs">{formatInstant(customer.lastLoginAt)}</span>
    ),
    csv: (customer) => formatInstant(customer.lastLoginAt),
    sortValue: (customer) => customer.lastLoginAt ?? '',
  },
  {
    id: 'created',
    header: 'Customer since',
    cell: (customer) => (
      <span className="text-fg-muted font-mono text-xs">{formatInstant(customer.createdAt)}</span>
    ),
    csv: (customer) => formatInstant(customer.createdAt),
    sortValue: (customer) => customer.createdAt,
  },
  {
    id: 'id',
    header: 'Identifier',
    cell: (customer) => <span className="text-fg-subtle font-mono text-xs">{customer.id}</span>,
    csv: (customer) => customer.id,
  },
];
