import { Injectable } from '@nestjs/common';

import { type NotificationChannel } from '@reliance/contracts';

import { ClockService } from '../../../common/clock/clock.service.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import {
  BOUNCE_DEGRADED_THRESHOLD,
  COMPLAINT_DEGRADED_THRESHOLD,
} from '../notifications.constants.js';

import {
  DeliveryStore,
  type RecordBounceInput,
  type RecordComplaintInput,
} from './delivery.store.js';
import {
  AddressHealth,
  TERMINAL_STATUSES,
  type AddressHealthRecord,
  type DeliveryOutcomeUpdate,
  type DeliveryRecord,
  type NewDelivery,
} from './delivery.types.js';

/**
 * In-process delivery log and address health.
 *
 * Applies the same degradation thresholds as the repository, so the bounce test proves the
 * rule rather than the twin's willingness to agree with it.
 */
@Injectable()
export class InMemoryDeliveryStore extends DeliveryStore {
  private readonly byId = new Map<string, DeliveryRecord>();
  private readonly health = new Map<string, AddressHealthRecord>();

  constructor(
    private readonly ids: IdGenerator = new IdGenerator(),
    private readonly clock: ClockService = new ClockService(),
  ) {
    super();
  }

  override async insert(delivery: NewDelivery, at: Date): Promise<DeliveryRecord> {
    const record: DeliveryRecord = {
      ...delivery,
      id: this.ids.generate('notification'),
      attempts: 0,
      providerMessageId: null,
      lastError: null,
      createdAt: at,
      updatedAt: at,
    };
    this.byId.set(record.id, record);
    return record;
  }

  override async findDelivery(id: string): Promise<DeliveryRecord | null> {
    return this.byId.get(id) ?? null;
  }

  override async findByProviderMessageId(
    providerMessageId: string,
  ): Promise<DeliveryRecord | null> {
    return (
      [...this.byId.values()].find((record) => record.providerMessageId === providerMessageId) ??
      null
    );
  }

  override async applyOutcome(update: DeliveryOutcomeUpdate): Promise<DeliveryRecord | null> {
    const record = this.byId.get(update.id);
    if (!record) return null;

    const next: DeliveryRecord = {
      ...record,
      status: update.status,
      attempts: update.attempts,
      nextAttemptAt: update.nextAttemptAt,
      updatedAt: update.at,
      providerMessageId:
        update.providerMessageId === undefined
          ? record.providerMessageId
          : update.providerMessageId,
      lastError: update.lastError === undefined ? record.lastError : update.lastError,
    };

    this.byId.set(update.id, next);
    return next;
  }

  override async findDue(now: Date, limit: number): Promise<DeliveryRecord[]> {
    return [...this.byId.values()]
      .filter((record) => !TERMINAL_STATUSES.includes(record.status))
      .filter((record) => record.nextAttemptAt !== null && record.nextAttemptAt <= now)
      .sort(
        (left, right) =>
          (left.nextAttemptAt?.getTime() ?? 0) - (right.nextAttemptAt?.getTime() ?? 0),
      )
      .slice(0, limit);
  }

  override async listForUser(userId: string, limit: number): Promise<DeliveryRecord[]> {
    return [...this.byId.values()]
      .filter((record) => record.userId === userId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, limit);
  }

  override async healthOf(
    channel: NotificationChannel,
    destination: string,
  ): Promise<AddressHealthRecord | null> {
    return this.health.get(keyOf(channel, destination)) ?? null;
  }

  override async degradedAmong(
    channel: NotificationChannel,
    destinations: readonly string[],
  ): Promise<string[]> {
    return destinations.filter(
      (destination) =>
        this.health.get(keyOf(channel, destination))?.health === AddressHealth.DEGRADED,
    );
  }

  override async recordBounce(input: RecordBounceInput): Promise<AddressHealthRecord> {
    return this.bump(input.channel, input.destination, input.reason, {
      bounces: input.permanent ? 1 : 0,
      complaints: 0,
    });
  }

  override async recordComplaint(input: RecordComplaintInput): Promise<AddressHealthRecord> {
    return this.bump(
      input.channel,
      input.destination,
      'The recipient marked our email as unwanted.',
      { bounces: 0, complaints: 1 },
    );
  }

  override async clearDegradation(
    channel: NotificationChannel,
    destination: string,
  ): Promise<void> {
    this.health.delete(keyOf(channel, destination));
  }

  private bump(
    channel: NotificationChannel,
    destination: string,
    reason: string,
    counts: { bounces: number; complaints: number },
  ): AddressHealthRecord {
    const key = keyOf(channel, destination);
    const current = this.health.get(key);

    const bounceCount = (current?.bounceCount ?? 0) + counts.bounces;
    const complaintCount = (current?.complaintCount ?? 0) + counts.complaints;

    const record: AddressHealthRecord = {
      channel,
      destination: destination.trim().toLowerCase(),
      bounceCount,
      complaintCount,
      lastReason: reason,
      health:
        bounceCount >= BOUNCE_DEGRADED_THRESHOLD || complaintCount >= COMPLAINT_DEGRADED_THRESHOLD
          ? AddressHealth.DEGRADED
          : AddressHealth.HEALTHY,
      updatedAt: this.clock.now(),
    };

    this.health.set(key, record);
    return record;
  }
}

function keyOf(channel: NotificationChannel, destination: string): string {
  return `${channel}:${destination.trim().toLowerCase()}`;
}
