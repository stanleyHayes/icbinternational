/**
 * Persistence boundary for browser push subscriptions.
 *
 * A customer has one per browser profile, and they expire without warning — a push service
 * answering `410 Gone` is the only notice we get that a subscription is dead, so removal
 * on that response is part of the contract rather than an optimisation.
 */

export interface PushSubscriptionRecord {
  readonly id: string;
  readonly userId: string;
  /** The push service URL. Unique — a browser reuses it across sessions. */
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
  readonly deviceLabel: string | null;
  readonly createdAt: Date;
  readonly lastUsedAt: Date | null;
}

export type NewPushSubscription = Omit<PushSubscriptionRecord, 'id' | 'createdAt' | 'lastUsedAt'>;

export abstract class PushSubscriptionStore {
  /** Creates, or refreshes the record for an endpoint the customer already registered. */
  abstract upsert(subscription: NewPushSubscription, at: Date): Promise<PushSubscriptionRecord>;

  abstract listForUser(userId: string): Promise<PushSubscriptionRecord[]>;

  abstract removeByEndpoint(endpoint: string): Promise<boolean>;

  abstract touch(endpoint: string, at: Date): Promise<void>;
}
