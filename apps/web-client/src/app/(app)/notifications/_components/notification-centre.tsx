'use client';

/**
 * Everything the bank has told the customer.
 *
 * The tray in the top bar shows the last few; this is the whole record, which is what somebody
 * opens when they are trying to work out when they were told something. Marking everything read is
 * a single action rather than a per-row chore.
 *
 * The list itself is the shell's `NotificationList`, so a notification looks the same here as it
 * does in the tray — including the word "Unread", which is what carries the state for a screen
 * reader.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Button, Switch } from '@reliance/ui';

import { FormAlert, LinkButton, NotificationList } from '@/components/shell';
import { laneRoutes, QueryPanel, Section } from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

/** Marks the whole feed read and refreshes the tray with it. */
function useMarkAllRead() {
  const cache = useQueryClient();

  return useMutation({
    mutationFn: async () => browserApi().notifications.markRead({}),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

/** The controls above the feed: filter, mark read, and the way to preferences. */
function FeedActions({
  unreadOnly,
  onUnreadOnly,
  markRead,
}: {
  readonly unreadOnly: boolean;
  readonly onUnreadOnly: (on: boolean) => void;
  readonly markRead: ReturnType<typeof useMarkAllRead>;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
      <Switch checked={unreadOnly} onChange={(event) => onUnreadOnly(event.target.checked)}>
        Unread only
      </Switch>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" loading={markRead.isPending} onClick={() => markRead.mutate()}>
          Mark everything read
        </Button>
        <LinkButton href={laneRoutes.settings.notifications} variant="ghost">
          Choose how we contact you
        </LinkButton>
      </div>
    </div>
  );
}

/**
 * @example <NotificationCentre />
 */
export function NotificationCentre() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const markRead = useMarkAllRead();

  const notifications = useQuery({
    queryKey: queryKeys.notifications.list(unreadOnly),
    queryFn: async () => (await browserApi().notifications.list({ unreadOnly })).data,
  });

  return (
    <Section title="Everything we have told you" description="Newest first." flush>
      <div className="px-5 pb-5">
        <FeedActions unreadOnly={unreadOnly} onUnreadOnly={setUnreadOnly} markRead={markRead} />
        <FormAlert error={markRead.error} />

        <QueryPanel query={notifications} skeletonRows={5}>
          {(list) => (
            <div className="border-border -mx-5 border-t">
              <NotificationList items={list} />
            </div>
          )}
        </QueryPanel>
      </div>
    </Section>
  );
}
