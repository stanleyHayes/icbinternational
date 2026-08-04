import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, type QueryFilter } from 'mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { BaseRepository } from '../../database/base.repository.js';

import { type NotificationSchemaClass } from './notification.schema.js';
import {
  NotificationStore,
  type ListNotificationsQuery,
  type NewNotification,
  type NotificationPage,
  type NotificationRecord,
} from './notification.store.js';
import { NOTIFICATION_MODEL } from './notifications.constants.js';

/** Mongo-backed notification centre. */
@Injectable()
export class NotificationRepository
  extends BaseRepository<NotificationSchemaClass>
  implements NotificationStore
{
  constructor(
    @InjectModel(NOTIFICATION_MODEL) model: Model<NotificationSchemaClass>,
    private readonly ids: IdGenerator,
  ) {
    super(model);
  }

  async insert(notification: NewNotification, createdAt: Date): Promise<NotificationRecord> {
    const created = await this.create({
      ...notification,
      id: this.ids.generate('notification'),
      read: false,
      readAt: null,
      createdAt,
    });
    return toRecord(created.toObject());
  }

  /**
   * Over-fetches by one so `hasMore` costs nothing.
   *
   * The cursor compares on `createdAt` and breaks ties on `id`, which is a ULID and
   * therefore already ordered by creation. Two notifications written in the same
   * millisecond still have a total order.
   */
  async list(query: ListNotificationsQuery): Promise<NotificationPage> {
    const found = await this.find(buildFilter(query), {
      sort: { createdAt: -1, id: -1 },
      limit: query.limit + 1,
    });

    const hasMore = found.length > query.limit;
    const page = hasMore ? found.slice(0, query.limit) : found;
    return { records: page.map((document) => toRecord(document.toObject())), hasMore };
  }

  async countUnread(userId: string): Promise<number> {
    return this.count({ userId, read: false });
  }

  async markRead(userId: string, ids: readonly string[], readAt: Date): Promise<number> {
    const scope: QueryFilter<NotificationSchemaClass> =
      ids.length > 0 ? { userId, id: { $in: [...ids] }, read: false } : { userId, read: false };

    return this.updateMany(scope, { $set: { read: true, readAt } });
  }

  async purgeBefore(before: Date): Promise<number> {
    const result = await this.collection.deleteMany({ createdAt: { $lt: before } }).exec();
    return result.deletedCount;
  }
}

function buildFilter(query: ListNotificationsQuery): QueryFilter<NotificationSchemaClass> {
  const filter: Record<string, unknown> = { userId: query.userId };
  if (query.category) filter.category = query.category;
  if (query.unreadOnly) filter.read = false;

  if (query.cursor) {
    const at = new Date(query.cursor.sortValue);
    filter.$or = [{ createdAt: { $lt: at } }, { createdAt: at, id: { $lt: query.cursor.id } }];
  }

  return filter as QueryFilter<NotificationSchemaClass>;
}

function toRecord(document: NotificationSchemaClass): NotificationRecord {
  return {
    id: document.id,
    userId: document.userId,
    category: document.category,
    severity: document.severity,
    templateKey: document.templateKey,
    title: document.title,
    body: document.body,
    actionUrl: document.actionUrl,
    actionLabel: document.actionLabel,
    iconKey: document.iconKey,
    read: document.read,
    readAt: document.readAt,
    createdAt: document.createdAt,
  };
}
