/**
 * Attempting a delivery, recording what happened, and coming back to it later.
 *
 * The invariant this service exists to hold: **every attempt is written down before it is
 * made**. A row exists in `QUEUED` before the provider is called, so a process that dies
 * mid-send leaves evidence, and the retry sweep picks the row up rather than the message
 * evaporating. Recording the attempt after a successful send would lose exactly the cases
 * worth investigating.
 *
 * Retries are swept on a schedule rather than held in memory, for the same reason.
 */

import { Injectable, Logger } from '@nestjs/common';

import { type NotificationChannel } from '@reliance/contracts';

import { ClockService } from '../../../common/clock/clock.service.js';
import { type ChannelRecipient, type OutboundMessage } from '../channels/channel.port.js';

import { ChannelRegistry } from './channel-registry.js';
import { DeliveryStore } from './delivery.store.js';
import { DeliveryStatus, type DeliveryRecord } from './delivery.types.js';
import { decideRetry, FailureKind, seedFrom } from './retry-policy.js';

/** Rows the sweep picks up in one pass. Bounded so a backlog drains steadily. */
const SWEEP_BATCH = 100;

export interface DispatchInput {
  readonly recipient: ChannelRecipient;
  readonly message: OutboundMessage;
  readonly channel: NotificationChannel;
  readonly notificationId: string | null;
  /** Held for quiet hours: the row is created now and attempted then. */
  readonly holdUntil: Date | null;
  readonly unsubscribeUrl?: string;
}

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    private readonly deliveries: DeliveryStore,
    private readonly channels: ChannelRegistry,
    private readonly clock: ClockService,
  ) {}

  /**
   * Creates the delivery row and attempts it, unless it is being held.
   *
   * A channel with no usable address, or one whose address is degraded, is recorded as
   * `SUPPRESSED` rather than attempted. That distinction matters when someone asks why a
   * customer did not receive something: "we chose not to send" and "we tried and failed"
   * are different answers and only one of them is a defect.
   */
  async dispatch(input: DispatchInput): Promise<DeliveryRecord> {
    const adapter = this.channels.get(input.channel);
    const now = this.clock.now();

    if (!adapter) {
      return this.recordSuppressed(input, 'That channel is not available on this deployment.', now);
    }

    const destination = adapter.destinationFor(input.recipient);
    if (!destination) {
      return this.recordSuppressed(input, 'There is no usable address for this channel.', now);
    }

    const degraded = await this.deliveries.degradedAmong(input.channel, [destination]);
    if (degraded.length > 0) {
      return this.recordSuppressed(input, 'This address has been marked as undeliverable.', now);
    }

    const row = await this.deliveries.insert(
      {
        userId: input.recipient.userId,
        notificationId: input.notificationId,
        templateKey: input.message.templateKey,
        channel: input.channel,
        destination,
        status: DeliveryStatus.QUEUED,
        nextAttemptAt: input.holdUntil ?? now,
      },
      now,
    );

    if (input.holdUntil) return row;
    return this.attempt(row, input.recipient, input.message, input.unsubscribeUrl);
  }

  /**
   * Makes one attempt against an existing row.
   *
   * Exported so the sweep can re-attempt without going back through preference resolution:
   * the decision to send was made once, and re-deciding it on a retry would let a
   * preference change between attempts silently swallow a message already in flight.
   */
  async attempt(
    row: DeliveryRecord,
    recipient: ChannelRecipient,
    message: OutboundMessage,
    unsubscribeUrl?: string,
  ): Promise<DeliveryRecord> {
    const adapter = this.channels.get(row.channel);
    const attempts = row.attempts + 1;
    const now = this.clock.now();

    if (!adapter) {
      return this.finalise(row, attempts, 'That channel is no longer available.', now);
    }

    const outcome = await adapter.send({
      recipient,
      message,
      destination: row.destination,
      deliveryId: row.id,
      ...(unsubscribeUrl ? { unsubscribeUrl } : {}),
    });

    if (outcome.ok) {
      const updated = await this.deliveries.applyOutcome({
        id: row.id,
        status: DeliveryStatus.SENT,
        attempts,
        providerMessageId: outcome.providerMessageId,
        lastError: null,
        nextAttemptAt: null,
        at: now,
      });
      return updated ?? row;
    }

    return this.scheduleRetry(row, attempts, outcome.failure, outcome.reason, now);
  }

  /** Queues another attempt, or gives up when the budget or the failure kind says so. */
  private async scheduleRetry(
    row: DeliveryRecord,
    attempts: number,
    failure: FailureKind,
    reason: string,
    now: Date,
  ): Promise<DeliveryRecord> {
    const retry = decideRetry({ attemptsMade: attempts, failure, now, seed: seedFrom(row.id) });
    if (!retry.shouldRetry) return this.finalise(row, attempts, reason, now);

    this.logger.debug(
      `Delivery ${row.id} failed on attempt ${attempts}; next at ${retry.nextAttemptAt?.toISOString()}`,
    );

    const updated = await this.deliveries.applyOutcome({
      id: row.id,
      status: DeliveryStatus.QUEUED,
      attempts,
      lastError: reason,
      nextAttemptAt: retry.nextAttemptAt,
      at: now,
    });

    return updated ?? row;
  }

  /** Rows whose retry has come due. The sweep in `retry-sweeper.service.ts` drives this. */
  async due(): Promise<DeliveryRecord[]> {
    return this.deliveries.findDue(this.clock.now(), SWEEP_BATCH);
  }

  private async recordSuppressed(
    input: DispatchInput,
    reason: string,
    now: Date,
  ): Promise<DeliveryRecord> {
    const row = await this.deliveries.insert(
      {
        userId: input.recipient.userId,
        notificationId: input.notificationId,
        templateKey: input.message.templateKey,
        channel: input.channel,
        destination: '',
        status: DeliveryStatus.SUPPRESSED,
        nextAttemptAt: null,
      },
      now,
    );

    const updated = await this.deliveries.applyOutcome({
      id: row.id,
      status: DeliveryStatus.SUPPRESSED,
      attempts: 0,
      lastError: reason,
      nextAttemptAt: null,
      at: now,
    });

    return updated ?? row;
  }

  private async finalise(
    row: DeliveryRecord,
    attempts: number,
    reason: string,
    now: Date,
  ): Promise<DeliveryRecord> {
    const updated = await this.deliveries.applyOutcome({
      id: row.id,
      status: DeliveryStatus.FAILED,
      attempts,
      lastError: reason,
      nextAttemptAt: null,
      at: now,
    });
    return updated ?? row;
  }
}

export { FailureKind };
