/**
 * Who this is, and what has been done to them.
 *
 * The header states the two facts that change how every other tab should be read: whether
 * the customer is frozen, and what tier they are verified to. Both are stated in words
 * next to their pill, because an operator who reads "Suspended" acts differently from one
 * who notices a red dot.
 *
 * The actions sit here rather than at the bottom of a tab so that freezing an account is
 * never something an operator does while looking at a transaction list and thinking about
 * something else.
 */

'use client';

import { Snowflake, UserRoundSearch } from 'lucide-react';

import { Permission, UserStatus, type User } from '@reliance/contracts';
import { Avatar, Badge, Button, StatusPill } from '@reliance/ui';

import { customerTone } from '@/components/compliance/kit';
import { formatInstant, humaniseCode } from '@/lib/format';
import { Can } from '@/lib/permissions';

import { fullName } from '../customer-columns';

export interface CustomerHeaderProps {
  readonly customer: User;
  readonly onFreeze: () => void;
  readonly onImpersonate: () => void;
}

function Facts({ customer }: Readonly<{ customer: User }>) {
  return (
    <dl className="font-body text-fg-muted flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
      <span className="flex gap-1.5">
        <dt>Customer since</dt>
        <dd className="text-fg font-mono">{formatInstant(customer.createdAt)}</dd>
      </span>
      <span className="flex gap-1.5">
        <dt>Last signed in</dt>
        <dd className="text-fg font-mono">{formatInstant(customer.lastLoginAt)}</dd>
      </span>
      <span className="flex gap-1.5">
        <dt>Identifier</dt>
        <dd className="text-fg font-mono">{customer.id}</dd>
      </span>
    </dl>
  );
}

function Contact({ customer }: Readonly<{ customer: User }>) {
  return (
    <p className="font-body text-fg-muted text-sm">
      {customer.email}
      {customer.emailVerified ? '' : ' — not verified'}
      {customer.phone ? ` · ${customer.phone}` : ''}
      {customer.phone && !customer.phoneVerified ? ' — not verified' : ''}
    </p>
  );
}

function Actions({ customer, onFreeze, onImpersonate }: CustomerHeaderProps) {
  const frozen = customer.status === UserStatus.SUSPENDED;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <Can permission={Permission.CUSTOMER_IMPERSONATE}>
        <Button
          variant="secondary"
          size="sm"
          onClick={onImpersonate}
          startIcon={<UserRoundSearch className="size-4" />}
        >
          View as customer
        </Button>
      </Can>
      <Can permission={Permission.CUSTOMER_FREEZE}>
        <Button
          variant={frozen ? 'secondary' : 'danger'}
          size="sm"
          onClick={onFreeze}
          startIcon={<Snowflake className="size-4" />}
        >
          {frozen ? 'Lift the freeze' : 'Freeze this customer'}
        </Button>
      </Can>
    </div>
  );
}

/** The identity band at the top of a customer record. */
export function CustomerHeader(props: CustomerHeaderProps) {
  const { customer } = props;

  return (
    <header className="border-border bg-surface flex flex-wrap items-start justify-between gap-4 rounded-md border p-4">
      <div className="flex min-w-0 gap-3">
        <Avatar name={fullName(customer)} size="lg" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-fg text-xl font-semibold">{fullName(customer)}</h1>
            <StatusPill
              tone={customerTone(customer.status)}
              label={humaniseCode(customer.status)}
            />
            <Badge>{humaniseCode(customer.segment)}</Badge>
            <Badge tone={customer.kycTier > 0 ? 'success' : 'warning'}>
              Verified to tier {customer.kycTier}
            </Badge>
          </div>
          <Contact customer={customer} />
          <Facts customer={customer} />
        </div>
      </div>

      <Actions {...props} />
    </header>
  );
}
