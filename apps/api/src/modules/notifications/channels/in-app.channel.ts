import { Injectable } from '@nestjs/common';

import { NotificationChannel } from '@reliance/contracts';

import {
  NotificationChannelAdapter,
  sent,
  type ChannelRecipient,
  type SendInput,
  type SendOutcome,
} from './channel.port.js';

/** The notification centre needs no address, which is what makes it the fallback. */
const IN_APP_DESTINATION = 'notification-centre';

/**
 * The in-app channel.
 *
 * It always succeeds, and that is not a shortcut. The notification record is written by
 * the bus *before* any channel is attempted, precisely so that the customer can always
 * find out what happened even when every addressable channel has failed — a bounced email
 * address and an expired push subscription still leave the centre. This adapter exists so
 * the delivery log carries a row for in-app like it does for everything else; the write
 * has already happened by the time it runs.
 */
@Injectable()
export class InAppChannel extends NotificationChannelAdapter {
  readonly channel = NotificationChannel.IN_APP;

  override destinationFor(_recipient: ChannelRecipient): string | null {
    return IN_APP_DESTINATION;
  }

  override async send(input: SendInput): Promise<SendOutcome> {
    return sent(input.deliveryId);
  }
}
