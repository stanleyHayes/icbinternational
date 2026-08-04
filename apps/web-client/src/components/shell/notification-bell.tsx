'use client';

/**
 * The notification bell.
 *
 * The unread count is announced through a live region rather than left to the red dot, because a
 * red dot is not information — a customer using a screen reader, or anyone with a red-green colour
 * deficiency, gets nothing from it. The dot is the sighted shorthand; the count is the fact.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import type { RefObject } from 'react';

import { Button } from '@reliance/ui';

import { browserApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

import { NotificationTray } from './notification-tray';
import { usePopover } from './use-popover';

const TRAY_SIZE = 5;

function summarise(unread: number): string {
  return unread === 0 ? 'Notifications, none unread' : `Notifications, ${unread} unread`;
}

interface TriggerProps {
  readonly ref: RefObject<HTMLButtonElement | null>;
  readonly unread: number;
  readonly open: boolean;
  readonly onToggle: () => void;
}

function Trigger({ ref, unread, open, onToggle }: TriggerProps) {
  return (
    <Button
      ref={ref}
      variant="ghost"
      iconOnly
      aria-label={summarise(unread)}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onToggle}
      className="relative"
    >
      <Bell aria-hidden="true" className="size-5" />
      {unread > 0 ? (
        <span
          aria-hidden="true"
          className="rounded-pill bg-danger-solid ring-surface absolute top-1.5 right-1.5 size-2 ring-2"
        />
      ) : null}
    </Button>
  );
}

/** Bell, unread count and a short tray of the most recent notifications. */
export function NotificationBell() {
  const { open, toggle, close, triggerRef, panelRef } = usePopover();
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: queryKeys.notifications.list(false),
    queryFn: async () => (await browserApi().notifications.list({ limit: TRAY_SIZE })).data,
  });

  const markAllRead = useMutation({
    mutationFn: () => browserApi().notifications.markRead({}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  });

  const unread = data?.filter((notification) => !notification.read).length ?? 0;

  return (
    <div className="relative">
      <Trigger ref={triggerRef} unread={unread} open={open} onToggle={toggle} />

      {/* Announced without stealing focus: money arriving should never move the caret. */}
      <span aria-live="polite" className="sr-only">
        {summarise(unread)}
      </span>

      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          className="border-border bg-surface-raised absolute right-0 z-40 mt-2 w-88 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border shadow-lg"
        >
          <NotificationTray
            items={data ?? []}
            unread={unread}
            loading={isPending}
            markingRead={markAllRead.isPending}
            onMarkAllRead={() => markAllRead.mutate()}
            onClose={close}
          />
        </div>
      ) : null}
    </div>
  );
}
