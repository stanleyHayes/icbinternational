import { Injectable } from '@nestjs/common';

import { IdGenerator } from '../../../../common/ids/id-generator.js';

import {
  PushSubscriptionStore,
  type NewPushSubscription,
  type PushSubscriptionRecord,
} from './push-subscription.store.js';

/** In-process push subscriptions, keyed by endpoint exactly as the unique index is. */
@Injectable()
export class InMemoryPushSubscriptionStore extends PushSubscriptionStore {
  private readonly byEndpoint = new Map<string, PushSubscriptionRecord>();

  constructor(private readonly ids: IdGenerator = new IdGenerator()) {
    super();
  }

  override async upsert(
    subscription: NewPushSubscription,
    at: Date,
  ): Promise<PushSubscriptionRecord> {
    const existing = this.byEndpoint.get(subscription.endpoint);

    const record: PushSubscriptionRecord = {
      ...subscription,
      id: existing?.id ?? this.ids.generate('device'),
      createdAt: existing?.createdAt ?? at,
      lastUsedAt: existing?.lastUsedAt ?? null,
    };

    this.byEndpoint.set(record.endpoint, record);
    return record;
  }

  override async listForUser(userId: string): Promise<PushSubscriptionRecord[]> {
    return [...this.byEndpoint.values()].filter((record) => record.userId === userId);
  }

  override async removeByEndpoint(endpoint: string): Promise<boolean> {
    return this.byEndpoint.delete(endpoint);
  }

  override async touch(endpoint: string, at: Date): Promise<void> {
    const record = this.byEndpoint.get(endpoint);
    if (record) this.byEndpoint.set(endpoint, { ...record, lastUsedAt: at });
  }
}
