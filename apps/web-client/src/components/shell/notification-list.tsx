'use client';

/**
 * The rows inside the notification tray.
 *
 * Unread is carried by a word, not only by weight and a dot: "Unread" is in the accessible name of
 * every unread row. Severity is carried by a tone *and* by the wording the API sent, never by
 * colour on its own.
 */

import Link from 'next/link';

import type { Notification, NotificationSeverity } from '@reliance/contracts';
import { cn, StatusPill, type Tone } from '@reliance/ui';

import { relativeTime } from '@/lib/format';

import { EmptyPanel } from './empty-panel';

const SEVERITY_TONE: Readonly<Record<NotificationSeverity, Tone>> = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  CRITICAL: 'danger',
};

/** Props for {@link NotificationList}. */
export interface NotificationListProps {
  readonly items: readonly Notification[];
  /** Closes the tray once a row is followed. */
  readonly onNavigate?: () => void;
}

/**
 * What the row says.
 *
 * Only the two severities a customer must act on are badged. Badging every notification
 * would make the badge mean nothing, which is the same as not having one.
 */
function RowBody({ item }: { readonly item: Notification }) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-fg text-sm font-medium">{item.title}</span>
        {item.severity === 'CRITICAL' || item.severity === 'WARNING' ? (
          <StatusPill
            tone={SEVERITY_TONE[item.severity]}
            label={item.severity === 'CRITICAL' ? 'Action needed' : 'Check this'}
          />
        ) : null}
      </div>
      <p className="text-fg-muted mt-0.5 line-clamp-2 text-sm">{item.body}</p>
      <p className="text-fg-subtle mt-1 text-xs">
        {relativeTime(item.createdAt)}
        {item.read ? '' : ' · Unread'}
      </p>
    </>
  );
}

function Row({
  item,
  onNavigate,
}: {
  readonly item: Notification;
  readonly onNavigate?: () => void;
}) {
  const body = <RowBody item={item} />;

  const classes = cn(
    'block px-3 py-3 text-left',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus',
    item.read ? 'bg-surface-raised' : 'bg-accent-soft/40',
  );

  return (
    <li className="border-border border-b last:border-0">
      {item.actionUrl ? (
        <Link
          href={{ pathname: item.actionUrl }}
          onClick={onNavigate}
          className={cn(classes, 'hover:bg-surface-sunken')}
        >
          {body}
        </Link>
      ) : (
        <div className={classes}>{body}</div>
      )}
    </li>
  );
}

/** A scrollable list of notifications, or an empty state when there are none. */
export function NotificationList({ items, onNavigate }: NotificationListProps) {
  if (items.length === 0) {
    return (
      <EmptyPanel
        bordered={false}
        className="px-3 py-8"
        title="Nothing new"
        description="We will tell you here when money arrives, a payment needs approving, or something needs your attention."
      />
    );
  }

  return (
    <ul className="max-h-96 overflow-y-auto">
      {items.map((item) => (
        <Row key={item.id} item={item} {...(onNavigate ? { onNavigate } : {})} />
      ))}
    </ul>
  );
}
