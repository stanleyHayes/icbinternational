/**
 * How the tickets module tells a customer something.
 *
 * A narrow port over the notification platform: the services speak conversation vocabulary
 * ("received", "replied", "resolved") and the adapter owns the template keys and the prop
 * shaping. Tests bind an in-memory adapter and assert on what the customer was told.
 *
 * There is no method for "the customer wrote to us". Agents work a queue rather than an
 * inbox, and the platform has no staff-side channel to publish on — the console's own
 * refetch is what surfaces a new message, which is why the queue is polled rather than
 * pushed.
 */
export abstract class TicketNotifier {
  /** The conversation is open, and the bank has committed to a reply time. */
  abstract ticketReceived(input: TicketReceivedNotice): Promise<void>;

  /** An agent has answered. */
  abstract ticketReplied(input: TicketRepliedNotice): Promise<void>;

  /** The conversation has been closed by the bank, with the reason it was closed for. */
  abstract ticketResolved(input: TicketResolvedNotice): Promise<void>;
}

/** Props for the acknowledgement. */
export interface TicketReceivedNotice {
  readonly userId: string;
  readonly reference: string;
  readonly subjectLine: string;
  readonly respondBy: string;
}

/** Props for an agent's reply. */
export interface TicketRepliedNotice {
  readonly userId: string;
  readonly reference: string;
  readonly agentName: string;
  readonly excerpt: string;
}

/** Props for the closing notification. */
export interface TicketResolvedNotice {
  readonly userId: string;
  readonly reference: string;
  readonly outcome: string;
}
