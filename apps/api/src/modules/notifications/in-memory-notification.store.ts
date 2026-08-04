import { Injectable } from '@nestjs/common';

import { IdGenerator } from '../../common/ids/id-generator.js';

import {
  NotificationStore,
  type ListNotificationsQuery,
  type NewNotification,
  type NotificationPage,
  type NotificationRecord,
} from './notification.store.js';

/**
 * In-process notification centre.
 *
 * Paginates the same way the repository does — newest first, tie-broken on the ULID — so a
 * cursor test that passes here describes the real ordering rather than insertion order.
 */
@Injectable()
export class InMemoryNotificationStore extends NotificationStore {
  private readonly byId = new Map<string, NotificationRecord>();

  constructor(private readonly ids: IdGenerator = new IdGenerator()) {
    super();
  }

  override async insert(
    notification: NewNotification,
    createdAt: Date,
  ): Promise<NotificationRecord> {
    const record: NotificationRecord = {
      ...notification,
      id: this.ids.generate('notification'),
      read: false,
      readAt: null,
      createdAt,
    };
    this.byId.set(record.id, record);
    return record;
  }

  override async list(query: ListNotificationsQuery): Promise<NotificationPage> {
    const ordered = [...this.byId.values()]
      .filter((record) => record.userId === query.userId)
      .filter((record) => !query.category || record.category === query.category)
      .filter((record) => !query.unreadOnly || !record.read)
      .sort(newestFirst)
      .filter((record) => isAfterCursor(record, query));

    const hasMore = ordered.length > query.limit;
    return { records: ordered.slice(0, query.limit), hasMore };
  }

  override async countUnread(userId: string): Promise<number> {
    return [...this.byId.values()].filter((record) => record.userId === userId && !record.read)
      .length;
  }

  override async markRead(userId: string, ids: readonly string[], readAt: Date): Promise<number> {
    const targets = [...this.byId.values()].filter(
      (record) =>
        record.userId === userId && !record.read && (ids.length === 0 || ids.includes(record.id)),
    );

    for (const record of targets) {
      this.byId.set(record.id, { ...record, read: true, readAt });
    }

    return targets.length;
  }

  override async purgeBefore(before: Date): Promise<number> {
    const stale = [...this.byId.values()].filter(
      (record) => record.createdAt.getTime() < before.getTime(),
    );
    for (const record of stale) this.byId.delete(record.id);
    return stale.length;
  }
}

function newestFirst(left: NotificationRecord, right: NotificationRecord): number {
  const byTime = right.createdAt.getTime() - left.createdAt.getTime();
  return byTime === 0 ? right.id.localeCompare(left.id) : byTime;
}

function isAfterCursor(record: NotificationRecord, query: ListNotificationsQuery): boolean {
  if (!query.cursor) return true;

  const boundary = new Date(query.cursor.sortValue).getTime();
  const at = record.createdAt.getTime();
  if (at < boundary) return true;
  return at === boundary && record.id < query.cursor.id;
}
