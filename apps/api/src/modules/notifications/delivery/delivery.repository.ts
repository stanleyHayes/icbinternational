import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model } from 'mongoose';

import { type NotificationChannel } from '@reliance/contracts';

import { IdGenerator } from '../../../common/ids/id-generator.js';
import { BaseRepository } from '../../../database/base.repository.js';
import {
  ADDRESS_HEALTH_MODEL,
  BOUNCE_DEGRADED_THRESHOLD,
  COMPLAINT_DEGRADED_THRESHOLD,
  DELIVERY_MODEL,
} from '../notifications.constants.js';

import { type AddressHealthSchemaClass, type DeliverySchemaClass } from './delivery.schema.js';
import {
  DeliveryStore,
  type RecordBounceInput,
  type RecordComplaintInput,
} from './delivery.store.js';
import {
  AddressHealth,
  DeliveryStatus,
  TERMINAL_STATUSES,
  type AddressHealthRecord,
  type DeliveryOutcomeUpdate,
  type DeliveryRecord,
  type NewDelivery,
} from './delivery.types.js';

/** Mongo-backed delivery log and address health. */
@Injectable()
export class DeliveryRepository
  extends BaseRepository<DeliverySchemaClass>
  implements DeliveryStore
{
  constructor(
    @InjectModel(DELIVERY_MODEL) model: Model<DeliverySchemaClass>,
    @InjectModel(ADDRESS_HEALTH_MODEL)
    private readonly healthModel: Model<AddressHealthSchemaClass>,
    private readonly ids: IdGenerator,
  ) {
    super(model);
  }

  async insert(delivery: NewDelivery, at: Date): Promise<DeliveryRecord> {
    const created = await this.create({
      ...delivery,
      id: this.ids.generate('notification'),
      attempts: 0,
      providerMessageId: null,
      lastError: null,
      createdAt: at,
    });
    return toDelivery(created.toObject());
  }

  async findDelivery(id: string): Promise<DeliveryRecord | null> {
    const found = await this.findOne({ id });
    return found ? toDelivery(found.toObject()) : null;
  }

  async findByProviderMessageId(providerMessageId: string): Promise<DeliveryRecord | null> {
    const found = await this.findOne({ providerMessageId });
    return found ? toDelivery(found.toObject()) : null;
  }

  async applyOutcome(update: DeliveryOutcomeUpdate): Promise<DeliveryRecord | null> {
    const changed = await this.updateById(update.id, {
      $set: {
        status: update.status,
        attempts: update.attempts,
        nextAttemptAt: update.nextAttemptAt,
        updatedAt: update.at,
        ...(update.providerMessageId === undefined
          ? {}
          : { providerMessageId: update.providerMessageId }),
        ...(update.lastError === undefined ? {} : { lastError: update.lastError }),
      },
    });

    return changed ? toDelivery(changed.toObject()) : null;
  }

  async findDue(now: Date, limit: number): Promise<DeliveryRecord[]> {
    const found = await this.find(
      { status: { $nin: [...TERMINAL_STATUSES] }, nextAttemptAt: { $ne: null, $lte: now } },
      { sort: { nextAttemptAt: 1 }, limit },
    );
    return found.map((document) => toDelivery(document.toObject()));
  }

  async listForUser(userId: string, limit: number): Promise<DeliveryRecord[]> {
    const found = await this.find({ userId }, { sort: { createdAt: -1 }, limit });
    return found.map((document) => toDelivery(document.toObject()));
  }

  async healthOf(
    channel: NotificationChannel,
    destination: string,
  ): Promise<AddressHealthRecord | null> {
    const found = await this.healthModel
      .findOne({ channel, destination: normalise(destination) })
      .exec();
    return found ? toHealth(found.toObject()) : null;
  }

  async degradedAmong(
    channel: NotificationChannel,
    destinations: readonly string[],
  ): Promise<string[]> {
    if (destinations.length === 0) return [];

    const found = await this.healthModel
      .find({
        channel,
        destination: { $in: destinations.map((value) => normalise(value)) },
        health: AddressHealth.DEGRADED,
      })
      .exec();

    return found.map((document) => document.destination);
  }

  async recordBounce(input: RecordBounceInput): Promise<AddressHealthRecord> {
    return this.bumpHealth({
      channel: input.channel,
      destination: input.destination,
      reason: input.reason,
      at: input.at,
      increment: input.permanent ? { bounceCount: 1 } : {},
    });
  }

  async recordComplaint(input: RecordComplaintInput): Promise<AddressHealthRecord> {
    return this.bumpHealth({
      channel: input.channel,
      destination: input.destination,
      reason: 'The recipient marked our email as unwanted.',
      at: input.at,
      increment: { complaintCount: 1 },
    });
  }

  async clearDegradation(channel: NotificationChannel, destination: string): Promise<void> {
    await this.healthModel
      .updateOne(
        { channel, destination: normalise(destination) },
        {
          $set: {
            health: AddressHealth.HEALTHY,
            bounceCount: 0,
            complaintCount: 0,
            lastReason: null,
          },
        },
      )
      .exec();
  }

  /**
   * Increments the counters, then re-reads them to decide the health.
   *
   * Two writes rather than one because the threshold is a function of the *new* counts,
   * and a single `$set` would have to guess at them. The window between the two is
   * harmless: the worst case is one further email to an address that is about to be
   * marked degraded.
   */
  private async bumpHealth(input: {
    channel: NotificationChannel;
    destination: string;
    reason: string;
    at: Date;
    increment: Record<string, number>;
  }): Promise<AddressHealthRecord> {
    const key = { channel: input.channel, destination: normalise(input.destination) };

    const bumped = await this.healthModel
      .findOneAndUpdate(
        key,
        {
          $inc: input.increment,
          $set: { lastReason: input.reason, updatedAt: input.at },
          $setOnInsert: key,
        },
        { new: true, upsert: true },
      )
      .exec();

    const degraded =
      bumped.bounceCount >= BOUNCE_DEGRADED_THRESHOLD ||
      bumped.complaintCount >= COMPLAINT_DEGRADED_THRESHOLD;

    if (!degraded) return toHealth(bumped.toObject());

    const marked = await this.healthModel
      .findOneAndUpdate(key, { $set: { health: AddressHealth.DEGRADED } }, { new: true })
      .exec();

    return toHealth((marked ?? bumped).toObject());
  }
}

function normalise(destination: string): string {
  return destination.trim().toLowerCase();
}

function toDelivery(document: DeliverySchemaClass): DeliveryRecord {
  return {
    id: document.id,
    userId: document.userId,
    notificationId: document.notificationId,
    templateKey: document.templateKey,
    channel: document.channel,
    destination: document.destination,
    status: document.status as DeliveryStatus,
    attempts: document.attempts,
    providerMessageId: document.providerMessageId,
    lastError: document.lastError,
    nextAttemptAt: document.nextAttemptAt,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function toHealth(document: AddressHealthSchemaClass): AddressHealthRecord {
  return {
    channel: document.channel,
    destination: document.destination,
    health: document.health as AddressHealth,
    bounceCount: document.bounceCount,
    complaintCount: document.complaintCount,
    lastReason: document.lastReason,
    updatedAt: document.updatedAt,
  };
}
