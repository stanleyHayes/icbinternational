/**
 * `/support/tickets` — the support console.
 */

import type { Metadata } from 'next';

import { TicketConsole } from './ticket-console';

export const metadata: Metadata = {
  title: 'Support',
};

/** The support queue, SLA board and conversation workspace. */
export default function TicketsPage() {
  return <TicketConsole />;
}
