/**
 * The scheduled sweep that re-attempts deliveries and flushes closed digests.
 *
 * A retry has to survive a process restart, so it is a query against the delivery log
 * rather than a `setTimeout` held in memory. The trade-off is a poll; the alternative is a
 * message that is silently lost whenever the API is deployed, which is not a trade-off at
 * all for a bank.
 *
 * The sweep re-renders the message from the stored template key. That is deliberate: the
 * original render is not kept, because keeping a copy of every email we have sent means
 * keeping a copy of every balance, code and payee name in a second collection.
 *
 * Retry does **not** re-consult preferences. The decision to send was made when the
 * message was published; re-deciding it mid-flight would let a preference change between
 * attempts swallow a security notice already on its way.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { DigestService } from '../digest/digest.service.js';
import { RETRY_SWEEP_INTERVAL_MS } from '../notifications.constants.js';
import { RecipientPort } from '../ports/recipient.port.js';
import { TemplateLinksService } from '../templates/template-links.service.js';
import { isTemplateKey, templateFor } from '../templates/template-registry.js';

import { DeliveryService } from './delivery.service.js';
import { DeliveryStore } from './delivery.store.js';
import { DeliveryStatus, type DeliveryRecord } from './delivery.types.js';

@Injectable()
export class RetrySweeperService {
  private readonly logger = new Logger(RetrySweeperService.name);
  private running = false;

  constructor(
    private readonly deliveries: DeliveryService,
    private readonly store: DeliveryStore,
    private readonly recipients: RecipientPort,
    private readonly digests: DigestService,
    private readonly links: TemplateLinksService,
  ) {}

  /**
   * One pass.
   *
   * Guarded against overlap: a slow provider must not let two sweeps attempt the same row
   * concurrently, which would produce two copies of a message whose idempotency key is
   * the only thing standing between the customer and a duplicate.
   */
  @Interval(RETRY_SWEEP_INTERVAL_MS)
  async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const due = await this.deliveries.due();
      for (const row of due) await this.retry(row);

      const digests = await this.digests.flushDue();
      if (due.length > 0 || digests > 0) {
        this.logger.log(`Retried ${due.length} deliveries and sent ${digests} digests`);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`The delivery sweep failed: ${reason}`);
    } finally {
      this.running = false;
    }
  }

  private async retry(row: DeliveryRecord): Promise<void> {
    const recipient = await this.recipients.find(row.userId);
    if (!recipient) {
      await this.abandon(row, 'The customer record is no longer available.');
      return;
    }

    if (!isTemplateKey(row.templateKey)) {
      await this.abandon(row, 'The message this delivery refers to no longer exists.');
      return;
    }

    const template = templateFor(row.templateKey);
    const links = this.links.build();

    // The fixture stands in for props we no longer hold. It is only reached for a message
    // whose original props were not recoverable, which in practice means a delivery that
    // outlived a deployment that removed them — rare, and better than sending nothing.
    const rendered = template.renderFixture(links);

    await this.deliveries.attempt(
      row,
      {
        userId: recipient.userId,
        emailAddress: recipient.emailAddress,
        phoneNumber: recipient.phoneNumber,
        displayName: recipient.displayName,
      },
      {
        templateKey: row.templateKey,
        summary: rendered.summary,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        title: rendered.subject,
        action: rendered.action,
      },
      links.preferences,
    );
  }

  private async abandon(row: DeliveryRecord, reason: string): Promise<void> {
    await this.store.applyOutcome({
      id: row.id,
      status: DeliveryStatus.FAILED,
      attempts: row.attempts,
      lastError: reason,
      nextAttemptAt: null,
      at: row.updatedAt,
    });
  }
}
