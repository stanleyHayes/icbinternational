import { Injectable, Logger } from '@nestjs/common';

import { NotificationBus } from '../../notifications/index.js';

import {
  TicketNotifier,
  type TicketReceivedNotice,
  type TicketRepliedNotice,
  type TicketResolvedNotice,
} from './ticket-notifier.port.js';

/**
 * The production {@link TicketNotifier}: one call into the notification bus per event.
 *
 * The `TICKET_RECEIVED`, `TICKET_REPLY` and `TICKET_RESOLVED` templates already existed in
 * the platform's catalogue and already make promises to the customer — a reply time on the
 * first, a reopened case on the last. This adapter is what makes those promises true.
 *
 * Delivery failures never propagate. A customer's message has been recorded and an agent's
 * answer has been published by the time this runs; failing the request would tell them
 * neither happened, and a client that retries would post the reply twice.
 */
@Injectable()
export class NotificationBusTicketNotifier extends TicketNotifier {
  private readonly logger = new Logger(NotificationBusTicketNotifier.name);

  constructor(private readonly bus: NotificationBus) {
    super();
  }

  async ticketReceived(input: TicketReceivedNotice): Promise<void> {
    await this.safePublish(() =>
      this.bus.publish(input.userId, 'TICKET_RECEIVED', {
        reference: input.reference,
        subjectLine: input.subjectLine,
        respondBy: input.respondBy,
      }),
    );
  }

  async ticketReplied(input: TicketRepliedNotice): Promise<void> {
    await this.safePublish(() =>
      this.bus.publish(input.userId, 'TICKET_REPLY', {
        reference: input.reference,
        agentName: input.agentName,
        excerpt: input.excerpt,
      }),
    );
  }

  async ticketResolved(input: TicketResolvedNotice): Promise<void> {
    await this.safePublish(() =>
      this.bus.publish(input.userId, 'TICKET_RESOLVED', {
        reference: input.reference,
        outcome: input.outcome,
      }),
    );
  }

  private async safePublish(publish: () => Promise<unknown>): Promise<void> {
    try {
      await publish();
    } catch (error) {
      this.logger.error(`Ticket notification failed: ${String(error)}`);
    }
  }
}
