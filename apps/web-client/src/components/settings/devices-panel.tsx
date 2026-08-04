'use client';

/**
 * Where the customer is signed in.
 *
 * The "sign out everywhere else" button is the whole reason this screen exists: it is what
 * somebody presses at two in the morning having realised their laptop was left in a hotel. So it
 * is prominent, it is step-up gated, and it says exactly what it will and will not end.
 */

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';

import type { Session } from '@reliance/contracts';
import { Badge, Button } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import { ConfirmAction, QueryPanel, Section, stepUpOptions } from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';

const REVOKE_ALL_CONSEQUENCE =
  'Every other phone, tablet and computer is signed out immediately. This session stays open, and nothing about your accounts or payments changes.';

/** Ending sessions, sharing one refresh. */
function useSessionActions() {
  const cache = useQueryClient();
  const refresh = async (): Promise<void> => {
    await cache.invalidateQueries({ queryKey: queryKeys.security.all });
  };

  const revokeOne = useMutation({
    mutationFn: async (id: string) => {
      await browserApi().devices.revokeSession(id);
    },
    onSuccess: refresh,
  });

  const revokeAll = useMutation({
    mutationFn: async ({ stepUpToken }: { readonly stepUpToken?: string }) => {
      await browserApi().devices.revokeAllSessions(stepUpOptions(stepUpToken));
    },
    onSuccess: refresh,
  });

  return { revokeOne, revokeAll };
}

function SessionRow({
  session,
  onRevoke,
}: {
  readonly session: Session;
  readonly onRevoke: (id: string) => void;
}) {
  return (
    <li className="border-border flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-0">
      <span className="min-w-0">
        <span className="text-fg flex items-center gap-2 text-sm font-medium">
          {session.deviceLabel}
          {session.current ? <Badge tone="accent">This device</Badge> : null}
        </span>
        <span className="text-fg-muted mt-0.5 block text-xs">
          {session.location ?? session.ipAddress} · last used {relativeTime(session.lastSeenAt)}
        </span>
      </span>

      {session.current ? null : (
        <Button variant="secondary" size="sm" onClick={() => onRevoke(session.id)}>
          Sign this one out
        </Button>
      )}
    </li>
  );
}

/**
 * @example <DevicesPanel />
 */
export function DevicesPanel() {
  const [confirming, setConfirming] = useState(false);
  const { revokeOne, revokeAll } = useSessionActions();

  const sessions = useQuery({
    queryKey: queryKeys.security.sessions(),
    queryFn: async () => (await browserApi().devices.listSessions()).data,
  });

  return (
    <Section
      title="Where you are signed in"
      description="Every session open on your account right now."
      action={
        <Button variant="danger" onClick={() => setConfirming(true)}>
          Sign out everywhere else
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <FormAlert error={revokeOne.error ?? revokeAll.error} />

        <SessionList query={sessions} onRevoke={revokeOne.mutate} />

        <ConfirmAction
          open={confirming}
          onClose={() => setConfirming(false)}
          title="Sign out everywhere else"
          consequence={REVOKE_ALL_CONSEQUENCE}
          confirmLabel="Sign the others out"
          destructive
          stepUpReason="sign out your other devices"
          onConfirm={(options) => revokeAll.mutateAsync(options)}
        />
      </div>
    </Section>
  );
}

/** Kept beside sessions because "which devices know me?" is the same question. */
export function TrustedDevices() {
  const devices = useQuery({
    queryKey: queryKeys.security.devices(),
    queryFn: async () => (await browserApi().devices.list()).data,
  });

  return (
    <Section
      title="Devices we recognise"
      description="A device we recognise is not asked for a second factor as often."
    >
      <QueryPanel query={devices} skeletonRows={2}>
        {(list) => (
          <ul className="flex flex-col">
            {list.map((device) => (
              <li
                key={device.id}
                className="border-border flex items-center justify-between gap-3 border-b py-3 last:border-0"
              >
                <span className="min-w-0">
                  <span className="text-fg block truncate text-sm font-medium">{device.label}</span>
                  <span className="text-fg-muted mt-0.5 block text-xs">
                    {device.platform} · last seen {relativeTime(device.lastSeenAt)}
                  </span>
                </span>
                {device.hasPasskey ? <Badge tone="credit">Passkey</Badge> : null}
              </li>
            ))}
          </ul>
        )}
      </QueryPanel>
    </Section>
  );
}

/** The open sessions, current one first as the API orders them. */
function SessionList({
  query,
  onRevoke,
}: {
  readonly query: UseQueryResult<Session[]>;
  readonly onRevoke: (id: string) => void;
}) {
  return (
    <QueryPanel query={query} skeletonRows={3}>
      {(list) => (
        <ul className="flex flex-col">
          {list.map((session) => (
            <SessionRow key={session.id} session={session} onRevoke={onRevoke} />
          ))}
        </ul>
      )}
    </QueryPanel>
  );
}
