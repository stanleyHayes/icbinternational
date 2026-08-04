import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

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

import {
  SmsSenderPort,
  toSingleSegment,
  type OutboundSms,
  type SmsSendResult,
} from './sms-sender.port.js';

/** E.164: a leading `+`, a non-zero country digit, then up to fourteen more. */
const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * The SMS channel.
 *
 * Refuses a number that is not E.164 as a permanent failure rather than handing it to a
 * transport that will bill us for rejecting it.
 */
@Injectable()
export class SmsChannel extends NotificationChannelAdapter {
  readonly channel = NotificationChannel.SMS;

  constructor(private readonly sender: SmsSenderPort) {
    super();
  }

  override destinationFor(recipient: ChannelRecipient): string | null {
    const number = recipient.phoneNumber?.replaceAll(/[\s-]/g, '') ?? null;
    return number && E164.test(number) ? number : null;
  }

  override async send(input: SendInput): Promise<SendOutcome> {
    if (!E164.test(input.destination)) {
      return failed(FailureKind.PERMANENT, 'The mobile number on the account is not usable.');
    }

    const result = await this.sender.send({
      to: input.destination,
      body: toSingleSegment(`Reliance Bank: ${input.message.summary}`),
      deliveryId: input.deliveryId,
    });

    if (result.ok) return sent(result.providerMessageId);
    return failed(result.permanent ? FailureKind.PERMANENT : FailureKind.TRANSIENT, result.reason);
  }
}

/**
 * The shipped SMS transport.
 *
 * Records the message against the delivery id and reports it accepted. Replace by binding
 * a different `SmsSenderPort` when an aggregator contract exists.
 */
@Injectable()
export class RecordingSmsSender extends SmsSenderPort {
  readonly transportName = 'recording';

  private readonly logger = new Logger('OutboundSms');
  private readonly captured: OutboundSms[] = [];

  override async send(message: OutboundSms): Promise<SmsSendResult> {
    this.captured.push(message);
    this.logger.log(`${maskNumber(message.to)} · ${message.body}`);
    return { ok: true, providerMessageId: `sms_${randomUUID()}` };
  }

  /** Everything queued so far, oldest first. */
  get outbox(): readonly OutboundSms[] {
    return this.captured;
  }

  clear(): void {
    this.captured.length = 0;
  }
}

/** Last three digits are enough to recognise your own number; the rest is not ours to log. */
function maskNumber(number: string): string {
  const tail = 3;
  return `${'•'.repeat(Math.max(0, number.length - tail))}${number.slice(-tail)}`;
}
