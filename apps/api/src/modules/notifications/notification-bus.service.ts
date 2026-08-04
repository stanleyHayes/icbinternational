/**
 * The event bus: one call in, a fanned-out set of deliveries out.
 *
 * Any module that wants to tell a customer something calls `publish` with a template key
 * and its props. Nothing outside this file decides which channels are used, whether quiet
 * hours apply, or whether a message may be batched — which is what makes the mandatory
 * security rule enforceable rather than aspirational.
 *
 * The order of operations is deliberate and load-bearing:
 *
 * 1. **Render once.** Every channel takes a slice of the same rendered message, so the
 *    email, the push notification and the notification centre cannot disagree.
 * 2. **Write the in-app record first**, whenever in-app is a resolved channel. It needs no
 *    address and cannot fail, so it is the customer's guaranteed copy.
 * 3. **Then dispatch the addressable channels**, each with its own delivery row.
 *
 * Publishing never throws for a delivery failure. A payment must not roll back because an
 * email provider is having a bad afternoon.
 */

import { Injectable, Logger } from '@nestjs/common';

import { NotificationChannel } from '@reliance/contracts';

import { type OutboundMessage } from './channels/channel.port.js';
import { DeliveryService } from './delivery/delivery.service.js';
import { DigestService } from './digest/digest.service.js';
import { NotificationCentreService } from './notification-centre.service.js';
import { type NotificationRecord } from './notification.store.js';
import { RecipientPort, type Recipient } from './ports/recipient.port.js';
import { NotificationPreferencesService } from './preferences/preferences.service.js';
import { TemplateLinksService } from './templates/template-links.service.js';
import {
  renderTemplate,
  templateFor,
  type TemplateKey,
  type TemplateProps,
} from './templates/template-registry.js';

export interface PublishResult {
  /** The in-app record, when in-app was one of the resolved channels. */
  readonly notification: NotificationRecord | null;
  readonly channels: readonly NotificationChannel[];
  /** Set when quiet hours deferred the addressable channels. */
  readonly heldUntil: Date | null;
}

interface FanOutInput {
  readonly recipient: Recipient;
  readonly message: OutboundMessage;
  readonly channels: readonly NotificationChannel[];
  readonly notificationId: string | null;
  readonly holdUntil: Date | null;
  readonly digestible: boolean;
}

@Injectable()
export class NotificationBus {
  private readonly logger = new Logger(NotificationBus.name);

  constructor(
    private readonly centre: NotificationCentreService,
    private readonly preferences: NotificationPreferencesService,
    private readonly deliveries: DeliveryService,
    private readonly recipients: RecipientPort,
    private readonly digests: DigestService,
    private readonly links: TemplateLinksService,
  ) {}

  /**
   * Tells a customer something.
   *
   * @returns what was decided. A caller that wants to know whether the customer was
   *   actually reached should read the delivery log; this answers the narrower question of
   *   what the platform undertook to do.
   */
  async publish<TKey extends TemplateKey>(
    userId: string,
    key: TKey,
    props: TemplateProps<TKey>,
  ): Promise<PublishResult> {
    const recipient = await this.recipients.find(userId);
    if (!recipient) {
      this.logger.warn(`Dropped ${key}: no such customer`);
      return { notification: null, channels: [], heldUntil: null };
    }

    const template = templateFor(key);
    const message = this.render(key, props);

    const decision = await this.preferences.decideChannels({
      userId,
      category: template.category,
      candidateChannels: template.channels,
      urgent: template.urgent,
      unavailableChannels: unavailableFor(recipient),
    });

    const notification = decision.channels.includes(NotificationChannel.IN_APP)
      ? await this.centre.record({
          userId,
          category: template.category,
          severity: template.severity,
          templateKey: key,
          title: message.subject,
          body: message.summary,
          action: message.action,
        })
      : null;

    await this.fanOut({
      recipient,
      message,
      channels: decision.channels,
      notificationId: notification?.id ?? null,
      holdUntil: decision.holdUntil,
      digestible: !template.urgent,
    });

    return { notification, channels: decision.channels, heldUntil: decision.holdUntil };
  }

  /** Publishes a balance change down the live stream. No record, no email — a nudge to refetch. */
  notifyBalanceChanged(userId: string, accountId: string): void {
    this.centre.notifyBalanceChanged(userId, accountId);
  }

  private render<TKey extends TemplateKey>(key: TKey, props: TemplateProps<TKey>): OutboundMessage {
    const rendered = renderTemplate(key, props, this.links.build());

    return {
      templateKey: key,
      summary: rendered.summary,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      title: rendered.subject,
      action: rendered.action,
    };
  }

  /**
   * Sends on every channel except in-app, which has already been written.
   *
   * Email for a non-urgent message goes to the digest when the customer has asked for that
   * category to be batched; everything else is dispatched now or held until quiet hours end.
   */
  private async fanOut(input: FanOutInput): Promise<void> {
    const addressable = input.channels.filter((channel) => channel !== NotificationChannel.IN_APP);

    for (const channel of addressable) {
      const batched =
        input.digestible &&
        channel === NotificationChannel.EMAIL &&
        (await this.digests.tryAppend(input.recipient.userId, input.message));

      if (batched) continue;

      await this.deliveries.dispatch({
        recipient: {
          userId: input.recipient.userId,
          emailAddress: input.recipient.emailAddress,
          phoneNumber: input.recipient.phoneNumber,
          displayName: input.recipient.displayName,
        },
        message: input.message,
        channel,
        notificationId: input.notificationId,
        holdUntil: input.holdUntil,
        unsubscribeUrl: this.links.build().preferences,
      });
    }
  }
}

/** Channels the customer simply has no address for. */
function unavailableFor(recipient: Recipient): NotificationChannel[] {
  const unavailable: NotificationChannel[] = [];
  if (!recipient.emailAddress) unavailable.push(NotificationChannel.EMAIL);
  if (!recipient.phoneNumber) unavailable.push(NotificationChannel.SMS);
  return unavailable;
}
