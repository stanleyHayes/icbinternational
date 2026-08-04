/**
 * Web push.
 *
 * One notification fans out to every browser the customer has subscribed. The outcome is
 * aggregated: the delivery succeeded if any endpoint accepted it, because a customer with
 * a laptop and a phone has been told even if the laptop's subscription has expired.
 *
 * `404` and `410` from a push service mean the subscription is gone for good. The
 * subscription is deleted immediately rather than retried, which is the only garbage
 * collection this collection gets.
 */

import { Injectable, Logger } from '@nestjs/common';

import { NotificationChannel } from '@reliance/contracts';

import { ClockService } from '../../../../common/clock/clock.service.js';
import { AppConfigService } from '../../../../config/config.service.js';
import { FailureKind } from '../../delivery/retry-policy.js';
import {
  failed,
  NotificationChannelAdapter,
  sent,
  type ChannelRecipient,
  type OutboundMessage,
  type SendInput,
  type SendOutcome,
} from '../channel.port.js';

import { PushSubscriptionStore, type PushSubscriptionRecord } from './push-subscription.store.js';
import { buildVapidAuthorization, encryptPushPayload } from './web-push-crypto.js';

const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_HOUR = 3600;
/** VAPID tokens must not live longer than 24 hours; twelve leaves room for clock skew. */
const VAPID_TTL_HOURS = 12;
const VAPID_TTL_SECONDS = VAPID_TTL_HOURS * SECONDS_PER_HOUR;
/** How long the push service should hold the message for an offline device. */
const PUSH_TTL_HOURS = 4;
const PUSH_TTL_SECONDS = PUSH_TTL_HOURS * SECONDS_PER_HOUR;
const NOT_FOUND = 404;
const GONE = 410;
/** Statuses that mean the subscription is dead and must be deleted, not retried. */
const GONE_STATUSES: readonly number[] = Object.freeze([NOT_FOUND, GONE]);
const CLIENT_ERROR_FLOOR = 400;
const SERVER_ERROR_FLOOR = 500;

/** Sentinel destination: push has no single address, it has a set of them. */
const PUSH_DESTINATION = 'web-push';

@Injectable()
export class PushChannel extends NotificationChannelAdapter {
  readonly channel = NotificationChannel.PUSH;

  private readonly logger = new Logger(PushChannel.name);

  constructor(
    private readonly subscriptions: PushSubscriptionStore,
    private readonly config: AppConfigService,
    private readonly clock: ClockService,
  ) {
    super();
  }

  override destinationFor(_recipient: ChannelRecipient): string | null {
    return this.config.webPush.enabled ? PUSH_DESTINATION : null;
  }

  override async send(input: SendInput): Promise<SendOutcome> {
    const targets = await this.subscriptions.listForUser(input.recipient.userId);
    if (targets.length === 0) {
      return failed(FailureKind.PERMANENT, 'This customer has no device registered for push.');
    }

    const payload = JSON.stringify(toPushPayload(input.message));
    const outcomes = await Promise.all(targets.map((target) => this.deliverTo(target, payload)));

    const accepted = outcomes.filter(Boolean).length;
    if (accepted > 0) return sent(null);

    return failed(FailureKind.TRANSIENT, 'No push endpoint accepted the notification.');
  }

  /** Returns true when this endpoint accepted the notification. */
  private async deliverTo(target: PushSubscriptionRecord, payload: string): Promise<boolean> {
    try {
      const encrypted = encryptPushPayload(payload, { p256dh: target.p256dh, auth: target.auth });
      const response = await fetch(target.endpoint, {
        method: 'POST',
        headers: {
          ...encrypted.headers,
          TTL: String(PUSH_TTL_SECONDS),
          Urgency: 'high',
          Authorization: this.authorizationFor(target.endpoint),
        },
        body: encrypted.body,
      });

      if (response.ok) {
        await this.subscriptions.touch(target.endpoint, this.clock.now());
        return true;
      }

      await this.handleRejection(target, response.status);
      return false;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Push endpoint unreachable for ${target.id}: ${reason}`);
      return false;
    }
  }

  private async handleRejection(target: PushSubscriptionRecord, status: number): Promise<void> {
    if (GONE_STATUSES.includes(status)) {
      await this.subscriptions.removeByEndpoint(target.endpoint);
      this.logger.log(`Removed expired push subscription ${target.id}`);
      return;
    }

    const permanent = status >= CLIENT_ERROR_FLOOR && status < SERVER_ERROR_FLOOR;
    this.logger.warn(
      `Push service answered ${status} for ${target.id}${permanent ? ' (not retryable)' : ''}`,
    );
  }

  private authorizationFor(endpoint: string): string {
    const push = this.config.webPush;
    return buildVapidAuthorization({
      audience: new URL(endpoint).origin,
      subject: push.subject,
      publicKey: push.publicKey,
      privateKey: push.privateKey,
      expiresAtSeconds:
        Math.floor(this.clock.timestamp() / MILLISECONDS_PER_SECOND) + VAPID_TTL_SECONDS,
    });
  }
}

/** The shape the service worker expects. Kept small — a push payload has a hard size limit. */
function toPushPayload(message: OutboundMessage): Record<string, string> {
  return {
    title: message.title,
    body: message.summary,
    tag: message.templateKey,
    ...(message.action ? { url: message.action.url } : {}),
  };
}
