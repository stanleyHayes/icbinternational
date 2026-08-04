/**
 * Ingesting delivery events from the email provider.
 *
 * The webhook is the only way we learn what happened after a message left the building.
 * A `202` from the provider's API means "accepted for delivery", which is not the same
 * claim as "delivered", and the difference is the entire reason this file exists.
 *
 * Three outcomes are acted on:
 *
 * - **delivered** — the row becomes `DELIVERED`, and the question "did you tell me?" now
 *   has a defensible answer.
 * - **bounced** — the row becomes `BOUNCED`. A *hard* bounce increments the address's
 *   count; a soft one does not, because a full mailbox says nothing about the address.
 * - **complained** — the row becomes `COMPLAINED` and the address is degraded on the
 *   spot. One complaint is one too many: continuing to send to someone who has marked us
 *   as unwanted damages the deliverability of the messages that matter.
 */

import { Injectable, Logger } from '@nestjs/common';

import { NotificationChannel } from '@reliance/contracts';

import { ClockService } from '../../../../common/clock/clock.service.js';
import { DeliveryStore } from '../../delivery/delivery.store.js';
import { DeliveryStatus } from '../../delivery/delivery.types.js';
import { type EmailWebhookEvent } from '../../notifications.dto.js';

/** Event names Resend emits, mapped to the delivery status each implies. */
const EVENT_STATUS: Readonly<Record<string, DeliveryStatus>> = Object.freeze({
  'email.delivered': DeliveryStatus.DELIVERED,
  'email.bounced': DeliveryStatus.BOUNCED,
  'email.complained': DeliveryStatus.COMPLAINED,
  'email.delivery_delayed': DeliveryStatus.SENT,
});

/** Bounce classifications that mean the address itself is bad. */
const HARD_BOUNCE_TYPES: readonly string[] = Object.freeze(['hard', 'permanent', 'suppressed']);

export interface WebhookOutcome {
  readonly handled: boolean;
  readonly detail: string;
}

@Injectable()
export class EmailWebhookService {
  private readonly logger = new Logger(EmailWebhookService.name);

  constructor(
    private readonly deliveries: DeliveryStore,
    private readonly clock: ClockService,
  ) {}

  /**
   * Applies one event.
   *
   * Unknown event types are acknowledged rather than rejected. A provider that receives a
   * non-2xx retries, and retrying an event we will never understand accomplishes nothing
   * except filling their queue and our log.
   */
  async ingest(event: EmailWebhookEvent): Promise<WebhookOutcome> {
    const status = EVENT_STATUS[event.type];
    if (!status) return { handled: false, detail: `Ignored event type ${event.type}` };

    const at = this.clock.now();
    const providerMessageId = event.data.email_id;
    const row = providerMessageId
      ? await this.deliveries.findByProviderMessageId(providerMessageId)
      : null;

    if (row) {
      await this.deliveries.applyOutcome({
        id: row.id,
        status,
        attempts: row.attempts,
        lastError: status === DeliveryStatus.DELIVERED ? null : describe(event),
        nextAttemptAt: null,
        at,
      });
    }

    const address = row?.destination ?? firstRecipient(event);
    if (address) await this.updateAddressHealth(status, address, event, at);

    return { handled: true, detail: `Recorded ${event.type}` };
  }

  private async updateAddressHealth(
    status: DeliveryStatus,
    address: string,
    event: EmailWebhookEvent,
    at: Date,
  ): Promise<void> {
    if (status === DeliveryStatus.BOUNCED) {
      const bounceType = (event.data.bounce?.type ?? '').toLowerCase();
      const permanent = HARD_BOUNCE_TYPES.some((kind) => bounceType.includes(kind));

      const health = await this.deliveries.recordBounce({
        channel: NotificationChannel.EMAIL,
        destination: address,
        reason: describe(event),
        permanent,
        at,
      });

      this.logger.warn(`Bounce recorded; address is now ${health.health}`);
      return;
    }

    if (status === DeliveryStatus.COMPLAINED) {
      await this.deliveries.recordComplaint({
        channel: NotificationChannel.EMAIL,
        destination: address,
        at,
      });
      this.logger.warn('Complaint recorded; the address will no longer be used.');
    }
  }
}

function describe(event: EmailWebhookEvent): string {
  return event.data.bounce?.message ?? `Provider reported ${event.type}`;
}

function firstRecipient(event: EmailWebhookEvent): string | null {
  const { to } = event.data;
  if (typeof to === 'string') return to;
  return to?.[0] ?? null;
}
