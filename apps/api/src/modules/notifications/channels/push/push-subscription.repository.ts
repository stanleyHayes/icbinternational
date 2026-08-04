import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model } from 'mongoose';

import { IdGenerator } from '../../../../common/ids/id-generator.js';
import { BaseRepository } from '../../../../database/base.repository.js';
import { PUSH_SUBSCRIPTION_MODEL } from '../../notifications.constants.js';

import { type PushSubscriptionSchemaClass } from './push-subscription.schema.js';
import {
  PushSubscriptionStore,
  type NewPushSubscription,
  type PushSubscriptionRecord,
} from './push-subscription.store.js';

/** Mongo-backed push subscriptions. */
@Injectable()
export class PushSubscriptionRepository
  extends BaseRepository<PushSubscriptionSchemaClass>
  implements PushSubscriptionStore
{
  constructor(
    @InjectModel(PUSH_SUBSCRIPTION_MODEL) model: Model<PushSubscriptionSchemaClass>,
    private readonly ids: IdGenerator,
  ) {
    super(model);
  }

  async upsert(subscription: NewPushSubscription, at: Date): Promise<PushSubscriptionRecord> {
    const saved = await this.collection
      .findOneAndUpdate(
        { endpoint: subscription.endpoint },
        {
          $set: {
            userId: subscription.userId,
            p256dh: subscription.p256dh,
            auth: subscription.auth,
            deviceLabel: subscription.deviceLabel,
          },
          $setOnInsert: {
            id: this.ids.generate('device'),
            endpoint: subscription.endpoint,
            createdAt: at,
          },
        },
        { new: true, upsert: true },
      )
      .exec();

    if (!saved) throw new Error('Could not save the push subscription');
    return toRecord(saved.toObject());
  }

  async listForUser(userId: string): Promise<PushSubscriptionRecord[]> {
    const found = await this.find({ userId }, { sort: { createdAt: -1 } });
    return found.map((document) => toRecord(document.toObject()));
  }

  async removeByEndpoint(endpoint: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ endpoint }).exec();
    return result.deletedCount > 0;
  }

  async touch(endpoint: string, at: Date): Promise<void> {
    await this.updateOne({ endpoint }, { $set: { lastUsedAt: at } });
  }
}

function toRecord(document: PushSubscriptionSchemaClass): PushSubscriptionRecord {
  return {
    id: document.id,
    userId: document.userId,
    endpoint: document.endpoint,
    p256dh: document.p256dh,
    auth: document.auth,
    deviceLabel: document.deviceLabel,
    createdAt: document.createdAt,
    lastUsedAt: document.lastUsedAt,
  };
}
