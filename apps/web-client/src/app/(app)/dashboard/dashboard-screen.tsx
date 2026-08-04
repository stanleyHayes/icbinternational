'use client';

/**
 * The home screen.
 *
 * The order is the order the questions get asked: what have I got, what can I do, what has
 * happened, what is about to happen. Everything below the accounts is in a two-column grid on a
 * wide viewport and a single column on a phone, in that same reading order — so a screen-reader
 * user and a phone user meet the panels in the same sequence a desktop user's eye does.
 *
 * **Nothing on this page shifts once it has painted.** Every panel declares its height before its
 * request resolves, and the eight requests resolve in an order the network decides. That is the
 * one property the layout is built around: a balance that arrives late must not push the quick
 * actions under the customer's thumb.
 */

import { AccountsStrip } from './_components/accounts-strip';
import { AlertsPanel } from './_components/alerts-panel';
import { GoalProgress } from './_components/goal-progress';
import { NetWorthPanel } from './_components/net-worth-panel';
import { QuickActions } from './_components/quick-actions';
import { RecentActivity } from './_components/recent-activity';
import { SpendSnapshot } from './_components/spend-snapshot';
import { UpcomingBills } from './_components/upcoming-bills';

/** Everything a customer needs on opening the app. */
export function DashboardScreen() {
  return (
    <div className="flex flex-col gap-6">
      <NetWorthPanel />
      <AccountsStrip />
      <QuickActions />

      <div className="grid gap-6 lg:grid-cols-2">
        <RecentActivity />
        <SpendSnapshot />
        <UpcomingBills />
        <GoalProgress />
        <AlertsPanel />
      </div>
    </div>
  );
}
