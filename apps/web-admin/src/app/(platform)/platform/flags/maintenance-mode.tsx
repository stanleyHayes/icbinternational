/**
 * Maintenance mode.
 *
 * Separated from the other flags and worded as what it is, because it is the only switch
 * on this screen that takes the bank away from its customers. Turning it on stops the app
 * and the website serving anything but a holding page; everything already in flight
 * settles, because payments do not stop being owed because a console was clicked.
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { FeatureFlag } from '@reliance/contracts';
import { Alert, Button, Card } from '@reliance/ui';

import { opsKeys } from '@/components/ops';
import { useApiClient } from '@/lib/api-client';
import { messageFor } from '@/lib/errors';
import { formatInstant } from '@/lib/format';

/** The flag the platform reads to decide whether to serve the holding page. */
export const MAINTENANCE_FLAG_KEY = 'maintenance-mode';

export interface MaintenanceModeProps {
  /** The flag as the platform currently holds it, or `null` if it is not provisioned. */
  readonly flag: FeatureFlag | null;
}

function NotProvisioned() {
  return (
    <Alert tone="neutral" title="Maintenance mode is not provisioned">
      The platform has no <code className="font-mono">{MAINTENANCE_FLAG_KEY}</code> flag, so there
      is nothing for this control to switch. Ask the platform team to create it before a release
      window that needs one.
    </Alert>
  );
}

/** The switch that takes the bank off the air, and the statement of what that means. */
export function MaintenanceMode({ flag }: MaintenanceModeProps) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => client.admin.setFlag(MAINTENANCE_FLAG_KEY, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: opsKeys.all('platform') }),
  });

  if (!flag) return <NotProvisioned />;

  return (
    <Card className="flex flex-col gap-3">
      {toggle.error && <Alert tone="danger">{messageFor(toggle.error)}</Alert>}

      {flag.enabled ? (
        <Alert tone="danger" title="The bank is in maintenance">
          Customers see a holding page in the app and on the website. Payments already accepted
          continue to settle; nothing new can be started. Turn this off as soon as the work is done.
        </Alert>
      ) : (
        <Alert tone="success" title="Serving customers normally">
          The app and the website are answering. Switching to maintenance stops new activity
          immediately and is visible to every customer.
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-body text-fg-muted text-xs">
          Last changed {formatInstant(flag.updatedAt)}.
        </span>
        <Button
          variant={flag.enabled ? 'primary' : 'danger'}
          loading={toggle.isPending}
          onClick={() => toggle.mutate(!flag.enabled)}
        >
          {flag.enabled ? 'Bring the bank back online' : 'Put the bank into maintenance'}
        </Button>
      </div>
    </Card>
  );
}
