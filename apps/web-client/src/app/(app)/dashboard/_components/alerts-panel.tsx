'use client';

/**
 * What needs the customer's attention.
 *
 * Unread notifications only, and the shell's own `NotificationList` renders them, so a row here
 * and the same row in the bell tray are the same component reading the same records. A home
 * screen that phrased an alert differently from the tray would be two banks telling one customer
 * two things.
 *
 * When there is nothing, the panel says so plainly rather than disappearing. A panel that vanishes
 * when empty changes the height of the page depending on the day, and the customer learns the
 * layout twice.
 */

import { NotificationList, LinkButton } from '@/components/shell';
import { appRoutes } from '@/lib/routes';

import { Panel } from './panel';
import { useAlerts } from './use-dashboard';

const ROWS = 4;
const ROW_HEIGHT = 84;
const BODY_HEIGHT = ROWS * ROW_HEIGHT;

/** Unread notifications, newest first. */
export function AlertsPanel() {
  const alerts = useAlerts();

  return (
    <Panel
      title="Needs your attention"
      description="Anything unread, newest first."
      minBodyHeight={BODY_HEIGHT}
      loading={alerts.isPending}
      error={alerts.isError ? alerts.error : undefined}
      action={
        <LinkButton href={appRoutes.notifications} variant="ghost">
          See all
        </LinkButton>
      }
    >
      <NotificationList items={alerts.data ?? []} />
    </Panel>
  );
}
