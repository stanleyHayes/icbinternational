import { Injectable, Logger } from '@nestjs/common';

import { NotificationBus } from '../../notifications/index.js';

import {
  DisputeNotifier,
  type DisputeRaisedNotice,
  type DisputeResolvedNotice,
  type DisputeUpdatedNotice,
} from './dispute-notifier.port.js';

/**
 * The production {@link DisputeNotifier}: one call into the notification bus per event.
 *
 * Delivery failures never propagate — a dispute decision moves real money and must not
 * roll back because an email provider is having a bad afternoon. The bus itself already
 * holds that line for channel failures; the catch here covers everything else, like a
 * recipient record that vanished mid-request.
 */
@Injectable()
export class NotificationBusDisputeNotifier extends DisputeNotifier {
  private readonly logger = new Logger(NotificationBusDisputeNotifier.name);

  constructor(private readonly bus: NotificationBus) {
    super();
  }

  async disputeRaised(input: DisputeRaisedNotice): Promise<void> {
    await this.safePublish(() =>
      this.bus.publish(input.userId, 'DISPUTE_RAISED', {
        reference: input.reference,
        merchantName: input.merchantName,
        amountFormatted: input.amountFormatted,
        decisionBy: input.decisionBy,
      }),
    );
  }

  async disputeUpdated(input: DisputeUpdatedNotice): Promise<void> {
    await this.safePublish(() =>
      this.bus.publish(input.userId, 'DISPUTE_UPDATE', {
        reference: input.reference,
        stage: input.stage,
        whatWeNeed: input.whatWeNeed,
        nextUpdateBy: input.nextUpdateBy,
      }),
    );
  }

  async disputeResolved(input: DisputeResolvedNotice): Promise<void> {
    await this.safePublish(() =>
      this.bus.publish(input.userId, 'DISPUTE_RESOLVED', {
        reference: input.reference,
        amountFormatted: input.amountFormatted,
        upheld: input.upheld,
        explanation: input.explanation,
      }),
    );
  }

  private async safePublish(publish: () => Promise<unknown>): Promise<void> {
    try {
      await publish();
    } catch (error) {
      this.logger.error(`Dispute notification failed: ${String(error)}`);
    }
  }
}
