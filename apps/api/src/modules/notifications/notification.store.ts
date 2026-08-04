/**
 * Persistence boundary for the in-app notification centre.
 *
 * The centre is the channel of last resort: it needs no address, cannot bounce and cannot
 * be filtered by a mail provider. A `SECURITY` notification is written here even when
 * every other channel has failed, which is why this store has no concept of a preference.
 */

import { type NotificationCategory, type NotificationSeverity } from '@reliance/contracts';

export interface NotificationRecord {
  /** Public id, `ntf_…`. */
  readonly id: string;
  readonly userId: string;
  readonly category: NotificationCategory;
  readonly severity: NotificationSeverity;
  /** Template that produced it. Kept so a message can be re-rendered or counted by type. */
  readonly templateKey: string;
  readonly title: string;
  readonly body: string;
  readonly actionUrl: string | null;
  readonly actionLabel: string | null;
  readonly iconKey: string | null;
  readonly read: boolean;
  readonly readAt: Date | null;
  readonly createdAt: Date;
}

export type NewNotification = Omit<NotificationRecord, 'id' | 'read' | 'readAt' | 'createdAt'>;

export interface NotificationPage {
  readonly records: readonly NotificationRecord[];
  /** One more than the caller asked for was fetched; this says whether it existed. */
  readonly hasMore: boolean;
}

export interface ListNotificationsQuery {
  readonly userId: string;
  readonly limit: number;
  readonly cursor?: { readonly sortValue: string; readonly id: string };
  readonly category?: NotificationCategory;
  readonly unreadOnly: boolean;
}

export abstract class NotificationStore {
  abstract insert(notification: NewNotification, createdAt: Date): Promise<NotificationRecord>;

  abstract list(query: ListNotificationsQuery): Promise<NotificationPage>;

  abstract countUnread(userId: string): Promise<number>;

  /**
   * Marks notifications read. An empty `ids` marks everything the customer has.
   *
   * @returns how many rows changed, so the caller can tell "already read" from "not yours".
   */
  abstract markRead(userId: string, ids: readonly string[], readAt: Date): Promise<number>;

  /** Removes notifications older than `before`. Used by the retention sweep. */
  abstract purgeBefore(before: Date): Promise<number>;
}
