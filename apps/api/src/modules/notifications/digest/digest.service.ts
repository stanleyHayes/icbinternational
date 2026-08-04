/**
 * Digest batching.
 *
 * A customer who has opted into a digest gets one email covering a window instead of six
 * covering nothing. Three rules keep it from turning into a way of losing messages:
 *
 * - **Urgent messages are never batched.** The bus does not even offer them here.
 * - **The window is fixed from the first item**, not slid forward by each arrival, so a
 *   busy account still receives its digest.
 * - **A full bucket is flushed immediately.** Twenty-five items is already more than
 *   anyone reads; holding a twenty-sixth for another two hours helps nobody.
 *
 * The in-app notification is always written regardless. Batching affects email, not the
 * customer's record of what happened.
 */

import { Injectable, Logger } from '@nestjs/common';

import { NotificationCategory, NotificationChannel } from '@reliance/contracts';

import { ClockService } from '../../../common/clock/clock.service.js';
import { type OutboundMessage } from '../channels/channel.port.js';
import { DeliveryService } from '../delivery/delivery.service.js';
import { DIGEST_MAX_ITEMS, DIGEST_WINDOW_MINUTES } from '../notifications.constants.js';
import { RecipientPort } from '../ports/recipient.port.js';
import { NotificationPreferencesService } from '../preferences/preferences.service.js';
import { TemplateLinksService } from '../templates/template-links.service.js';
import { categoryOf, isTemplateKey, renderTemplate } from '../templates/template-registry.js';

import { DigestStore, type DigestBucket } from './digest.store.js';

const MILLISECONDS_PER_MINUTE = 60_000;
const FLUSH_BATCH = 50;
const DIGEST_TEMPLATE = 'NOTIFICATION_DIGEST' as const;

@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);

  constructor(
    private readonly buckets: DigestStore,
    private readonly deliveries: DeliveryService,
    private readonly recipients: RecipientPort,
    private readonly preferences: NotificationPreferencesService,
    private readonly links: TemplateLinksService,
    private readonly clock: ClockService,
  ) {}

  /**
   * Adds a message to the customer's digest if they have asked for one.
   *
   * "Asked for one" means this message's category specifically: a customer who batches
   * marketing has not agreed to have a payment notice held back with it. Categories
   * outside {@link DIGESTIBLE_CATEGORIES} are never absorbed either, however the
   * preference row reads — a stale row must not turn the digest into a second mute.
   *
   * @returns true when the message was absorbed, in which case the caller must not also
   *   send it. False means "send it yourself", which is the common case.
   */
  async tryAppend(userId: string, message: OutboundMessage): Promise<boolean> {
    const preference = await this.preferences.record(userId);
    if (!preference || !isDigestWanted(preference.digestEnabledCategories, message)) {
      return false;
    }

    const now = this.clock.now();
    const bucket = await this.buckets.append({
      userId,
      item: { summary: message.summary, at: now },
      dueAt: new Date(now.getTime() + DIGEST_WINDOW_MINUTES * MILLISECONDS_PER_MINUTE),
    });

    if (bucket.items.length >= DIGEST_MAX_ITEMS) await this.flush(bucket);
    return true;
  }

  /** Sends every bucket whose window has closed. Driven by the scheduled sweep. */
  async flushDue(): Promise<number> {
    const due = await this.buckets.findDue(this.clock.now(), FLUSH_BATCH);
    for (const bucket of due) await this.flush(bucket);
    return due.length;
  }

  private async flush(bucket: DigestBucket): Promise<void> {
    await this.buckets.clear(bucket.userId);

    const recipient = await this.recipients.find(bucket.userId);
    if (!recipient?.emailAddress) {
      this.logger.debug(`Discarded a digest for ${bucket.userId}: no usable email address`);
      return;
    }

    const rendered = renderTemplate(
      DIGEST_TEMPLATE,
      {
        periodLabel: describeWindow(bucket, this.clock.now()),
        itemCount: String(bucket.items.length),
        lines: bucket.items.map((item) => item.summary),
      },
      this.links.build(),
    );

    await this.deliveries.dispatch({
      recipient: {
        userId: recipient.userId,
        emailAddress: recipient.emailAddress,
        phoneNumber: recipient.phoneNumber,
        displayName: recipient.displayName,
      },
      message: {
        templateKey: DIGEST_TEMPLATE,
        summary: rendered.summary,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        title: rendered.subject,
        action: rendered.action,
      },
      channel: NotificationChannel.EMAIL,
      notificationId: null,
      holdUntil: null,
      unsubscribeUrl: this.links.build().preferences,
    });
  }
}

const MINUTES_PER_HOUR = 60;

/** "the last 4 hours" — phrased for the subject line, not for a log. */
function describeWindow(bucket: DigestBucket, now: Date): string {
  const minutes = Math.max(
    1,
    Math.round((now.getTime() - bucket.openedAt.getTime()) / MILLISECONDS_PER_MINUTE),
  );

  if (minutes < MINUTES_PER_HOUR) return `the last ${minutes} minutes`;

  const hours = Math.round(minutes / MINUTES_PER_HOUR);
  return hours === 1 ? 'the last hour' : `the last ${hours} hours`;
}

/** Categories a digest is allowed to absorb. Security is deliberately absent. */
export const DIGESTIBLE_CATEGORIES: readonly NotificationCategory[] = Object.freeze([
  NotificationCategory.TRANSACTION,
  NotificationCategory.ACCOUNT,
  NotificationCategory.CARD,
  NotificationCategory.SAVINGS,
  NotificationCategory.MARKETING,
]);

/** True when the customer asked for this message's category to be batched. */
function isDigestWanted(enabledCategories: readonly string[], message: OutboundMessage): boolean {
  if (enabledCategories.length === 0 || !isTemplateKey(message.templateKey)) return false;

  const category = categoryOf(message.templateKey);
  return DIGESTIBLE_CATEGORIES.includes(category) && enabledCategories.includes(category);
}
