'use client';

/**
 * The panel that drops out of the notification bell.
 *
 * A summary, not the notification centre. Five items and a way through to the full list: a dropdown
 * that tries to be an inbox is a dropdown nobody can scroll on a phone.
 */

import Link from 'next/link';

import type { Notification } from '@reliance/contracts';
import { Badge, Button, cn, Skeleton, TEXT_STYLE } from '@reliance/ui';

import { appRoutes } from '@/lib/routes';

import { NotificationList } from './notification-list';

/** Props for {@link NotificationTray}. */
export interface NotificationTrayProps {
  readonly items: readonly Notification[];
  readonly unread: number;
  readonly loading: boolean;
  readonly markingRead: boolean;
  readonly onMarkAllRead: () => void;
  readonly onClose: () => void;
}

function TrayHeader({ unread }: { readonly unread: number }) {
  return (
    <div className="border-border flex items-center justify-between gap-2 border-b px-3 py-2">
      <span className={cn(TEXT_STYLE.label)}>Notifications</span>
      {unread > 0 ? (
        <Badge tone="accent" size="sm">
          {unread} new
        </Badge>
      ) : null}
    </div>
  );
}

/** Header, list and footer of the tray. */
export function NotificationTray(props: NotificationTrayProps) {
  const { items, unread, loading, markingRead, onMarkAllRead, onClose } = props;

  return (
    <>
      <TrayHeader unread={unread} />

      {loading ? (
        <div className="space-y-3 p-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : (
        <NotificationList items={items} onNavigate={onClose} />
      )}

      <div className="border-border flex items-center justify-between gap-2 border-t px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={unread === 0}
          loading={markingRead}
          onClick={onMarkAllRead}
        >
          Mark all as read
        </Button>
        <Link
          href={appRoutes.notifications}
          onClick={onClose}
          className="text-accent focus-visible:ring-focus rounded-sm px-2 py-1 text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          See all
        </Link>
      </div>
    </>
  );
}
