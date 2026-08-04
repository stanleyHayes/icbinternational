import { Injectable } from '@nestjs/common';

import { NotificationChannel } from '@reliance/contracts';

import { FailureKind } from '../../delivery/retry-policy.js';
import {
  failed,
  NotificationChannelAdapter,
  sent,
  type ChannelRecipient,
  type SendInput,
  type SendOutcome,
} from '../channel.port.js';

import { EmailSenderPort } from './email-sender.port.js';

/** Lets a customer unsubscribe from the mail client, as bulk senders are expected to. */
const LIST_UNSUBSCRIBE_HEADER = 'List-Unsubscribe';
const LIST_UNSUBSCRIBE_POST_HEADER = 'List-Unsubscribe-Post';
const ONE_CLICK = 'List-Unsubscribe=One-Click';

/**
 * The email channel.
 *
 * Thin by design: it turns a rendered message into an {@link OutboundEmail} and hands it
 * to whichever transport is bound. Everything interesting — retries, bounces, degraded
 * addresses — belongs to the delivery service, because it applies to SMS and push too.
 */
@Injectable()
export class EmailChannel extends NotificationChannelAdapter {
  readonly channel = NotificationChannel.EMAIL;

  constructor(private readonly sender: EmailSenderPort) {
    super();
  }

  override destinationFor(recipient: ChannelRecipient): string | null {
    return recipient.emailAddress;
  }

  override async send(input: SendInput): Promise<SendOutcome> {
    const result = await this.sender.send({
      to: input.destination,
      toName: input.recipient.displayName,
      subject: input.message.subject,
      html: input.message.html,
      text: input.message.text,
      idempotencyKey: input.deliveryId,
      ...(input.unsubscribeUrl ? { headers: unsubscribeHeaders(input.unsubscribeUrl) } : {}),
      tags: { template: input.message.templateKey },
    });

    if (result.ok) return sent(result.providerMessageId);
    return failed(result.permanent ? FailureKind.PERMANENT : FailureKind.TRANSIENT, result.reason);
  }
}

function unsubscribeHeaders(url: string): Record<string, string> {
  return {
    [LIST_UNSUBSCRIBE_HEADER]: `<${url}>`,
    [LIST_UNSUBSCRIBE_POST_HEADER]: ONE_CLICK,
  };
}
