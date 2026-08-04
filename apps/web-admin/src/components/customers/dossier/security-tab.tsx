/**
 * How this customer gets in, and from where.
 *
 * The device and session list is derived from the audit chain rather than read from a
 * separate store, and that is the honest construction: the chain is the only record of
 * access that cannot be quietly rewritten, and every entry already carries the address
 * and the browser it came from. Grouping by user agent gives the devices; the raw entries
 * give the sessions.
 *
 * Ending sessions is deliberately not a button of its own. A freeze already ends every
 * session and refuses new sign-ins, and a second control that does half of that invites
 * an operator to reach for the weaker one during an account takeover.
 */

'use client';

import { Fingerprint, Globe, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

import type { AuditEvent, User } from '@reliance/contracts';
import { Badge, EmptyState } from '@reliance/ui';

import { QueueError, QueueLoading, ScreenPanel, useConsoleNow } from '@/components/compliance/kit';
import { formatElapsed, formatInstant, humaniseCode } from '@/lib/format';

import { useCustomerHistory } from '../data/use-dossier';

/** One browser or app the customer's activity has been seen from. */
interface SeenDevice {
  readonly userAgent: string;
  readonly addresses: readonly string[];
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly events: number;
}

/** Adds an address to a device's list without repeating one already recorded. */
function withAddress(addresses: readonly string[], address: string | null): readonly string[] {
  const value = address ?? 'address not recorded';
  return addresses.includes(value) ? addresses : [...addresses, value];
}

/** The earlier of two ISO instants. */
const earlier = (left: string, right: string): string => (left < right ? left : right);
/** The later of two ISO instants. */
const later = (left: string, right: string): string => (left > right ? left : right);

/** Folds one more audit entry into the row for its client. */
function foldEvent(seen: SeenDevice | undefined, event: AuditEvent, agent: string): SeenDevice {
  const previous = seen ?? {
    userAgent: agent,
    addresses: [],
    firstSeenAt: event.at,
    lastSeenAt: event.at,
    events: 0,
  };

  return {
    userAgent: agent,
    addresses: withAddress(previous.addresses, event.ipAddress),
    firstSeenAt: earlier(previous.firstSeenAt, event.at),
    lastSeenAt: later(previous.lastSeenAt, event.at),
    events: previous.events + 1,
  };
}

/** Folds audit entries into one row per distinct client, newest activity first. */
function groupDevices(events: readonly AuditEvent[]): readonly SeenDevice[] {
  const byAgent = new Map<string, SeenDevice>();

  for (const event of events) {
    const agent = event.userAgent;
    if (!agent) continue;
    byAgent.set(agent, foldEvent(byAgent.get(agent), event, agent));
  }

  return [...byAgent.values()].sort((left, right) =>
    right.lastSeenAt.localeCompare(left.lastSeenAt),
  );
}

function Fact({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="font-body text-fg-subtle text-xs tracking-wider uppercase">{label}</dt>
      <dd className="flex flex-wrap items-center gap-1.5">{children}</dd>
    </div>
  );
}

/** Whether a telephone number exists and whether it has been proven. */
function phoneState(customer: User): { readonly label: string; readonly verified: boolean } {
  if (!customer.phone) return { label: 'Not given', verified: false };
  return customer.phoneVerified
    ? { label: 'Verified', verified: true }
    : { label: 'Not verified', verified: false };
}

function AuthenticationPanel({ customer }: Readonly<{ customer: User }>) {
  const phone = phoneState(customer);

  return (
    <ScreenPanel title="How this customer signs in">
      <dl className="grid gap-3 sm:grid-cols-3">
        <Fact label="Second factor">
          {customer.mfaEnabled ? (
            customer.mfaMethods.map((method) => (
              <Badge key={method} tone="success">
                {humaniseCode(method)}
              </Badge>
            ))
          ) : (
            <Badge tone="danger">Not enrolled</Badge>
          )}
        </Fact>
        <Fact label="Email address">
          <Badge tone={customer.emailVerified ? 'success' : 'warning'}>
            {customer.emailVerified ? 'Verified' : 'Not verified'}
          </Badge>
        </Fact>
        <Fact label="Telephone number">
          <Badge tone={phone.verified ? 'success' : 'warning'}>{phone.label}</Badge>
        </Fact>
      </dl>
    </ScreenPanel>
  );
}

interface DeviceListProps {
  readonly devices: readonly SeenDevice[];
  readonly nowMs: number;
}

function DeviceList({ devices, nowMs }: DeviceListProps) {
  if (devices.length === 0) {
    return (
      <EmptyState
        icon={<Fingerprint className="size-5" />}
        title="No recorded access"
        description="Nothing in the audit chain names a device for this customer yet."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {devices.map((device) => (
        <li
          key={device.userAgent}
          className="border-border flex flex-wrap items-start justify-between gap-2 rounded-md border p-3"
        >
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="font-body text-fg truncate text-sm" title={device.userAgent}>
              {device.userAgent}
            </span>
            <span className="text-fg-muted flex items-center gap-1.5 font-mono text-xs">
              <Globe aria-hidden="true" className="size-3.5" />
              {device.addresses.join(', ')}
            </span>
          </span>
          <span className="font-body text-fg-muted flex flex-col items-end gap-0.5 text-xs">
            <span>Last seen {formatElapsed(device.lastSeenAt, nowMs)}</span>
            <span className="font-mono">First seen {formatInstant(device.firstSeenAt)}</span>
            <span>{device.events} recorded actions</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export interface SecurityTabProps {
  readonly customer: User;
}

/** Authentication posture and the clients this customer has been seen from. */
export function SecurityTab({ customer }: SecurityTabProps) {
  const history = useCustomerHistory(customer.id);
  const nowMs = useConsoleNow();

  return (
    <div className="flex flex-col gap-4">
      <AuthenticationPanel customer={customer} />

      <ScreenPanel title="Devices and sessions">
        {history.isPending && <QueueLoading label="access history" />}
        {history.isError && (
          <QueueError
            error={history.error}
            subject="this customer's access history"
            onRetry={history.refetch}
          />
        )}
        {history.data && <DeviceList devices={groupDevices(history.data)} nowMs={nowMs} />}
      </ScreenPanel>

      <p className="border-border bg-surface-sunken font-body text-fg-muted flex items-start gap-2 rounded-md border p-3 text-sm">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        To sign this customer out everywhere, freeze the account. A freeze ends every session
        immediately and refuses new sign-ins until it is lifted.
      </p>
    </div>
  );
}
