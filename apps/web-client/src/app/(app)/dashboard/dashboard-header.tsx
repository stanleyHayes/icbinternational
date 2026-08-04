'use client';

/**
 * The home screen's heading.
 *
 * It greets the customer by name once the session record has loaded, and says "Welcome back"
 * until then. Both strings sit inside a heading whose height is fixed by its type style, so the
 * name arriving changes the words and not the layout — which is the same rule every panel on this
 * page follows.
 *
 * The time of day comes from the customer's own device. A greeting driven by the server's clock
 * says "good evening" to somebody having breakfast.
 */

import { PageHeader } from '@/components/shell';
import { nowMs } from '@/lib/clock';
import { useSessionUser } from '@/lib/use-session-user';

const NOON = 12;
const EVENING = 18;

/** Morning, afternoon or evening. */
function timeOfDay(hour: number): string {
  if (hour < NOON) return 'Good morning';
  return hour < EVENING ? 'Good afternoon' : 'Good evening';
}

/** The greeting, the date, and nothing else. */
export function DashboardHeader() {
  const session = useSessionUser();
  const first = session.data?.firstName;
  const title = first ? `${timeOfDay(new Date(nowMs()).getHours())}, ${first}` : 'Welcome back';

  return (
    <PageHeader
      title={title}
      description="Your balances, what has moved recently, and anything that needs you."
    />
  );
}
