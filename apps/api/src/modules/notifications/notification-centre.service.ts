/**
 * The in-app notification centre: listing, counting and marking read.
 *
 * Every read is scoped by the caller's id taken from the verified token, so there is no
 * path here that can address another customer's notifications — the scope is a query
 * parameter to the store, not a check applied to the result.
 */

import { Injectable } from '@nestjs/common';

import {
  type Notification,
  type NotificationCategory,
  type NotificationSeverity,
  type Paginated,
} from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { decodeCursor, encodeCursor, type CursorPayload } from '../../common/pagination/cursor.js';

import { toContractNotification } from './notification.mapper.js';
import { NotificationStore, type NotificationRecord } from './notification.store.js';
import { NOTIFICATION_RETENTION_DAYS } from './notifications.constants.js';
import { NotificationStreamService } from './stream/notification-stream.service.js';

const HOURS_PER_DAY = 24;
const MILLISECONDS_PER_HOUR = 3_600_000;

/** Everything needed to add one entry to a customer's centre. */
export interface RecordNotificationInput {
  readonly userId: string;
  readonly category: NotificationCategory;
  readonly severity: NotificationSeverity;
  readonly templateKey: string;
  readonly title: string;
  readonly body: string;
  readonly action: { readonly label: string; readonly url: string } | null;
}

export interface ListNotificationsInput {
  readonly userId: string;
  readonly limit: number;
  readonly cursor?: string;
  readonly category?: NotificationCategory;
  readonly unreadOnly: boolean;
}

@Injectable()
export class NotificationCentreService {
  constructor(
    private readonly notifications: NotificationStore,
    private readonly stream: NotificationStreamService,
    private readonly clock: ClockService,
  ) {}

  /**
   * Writes an entry and pushes it down the customer's live stream.
   *
   * The write happens before any addressable channel is attempted, because the centre
   * needs no address and cannot bounce. A customer whose email has been marked
   * undeliverable and whose push subscription has expired still finds out here.
   */
  async record(input: RecordNotificationInput): Promise<NotificationRecord> {
    const record = await this.notifications.insert(
      {
        userId: input.userId,
        category: input.category,
        severity: input.severity,
        templateKey: input.templateKey,
        title: input.title,
        body: input.body,
        actionUrl: input.action?.url ?? null,
        actionLabel: input.action?.label ?? null,
        iconKey: input.category.toLowerCase(),
      },
      this.clock.now(),
    );

    this.stream.publishNotification(input.userId, toContractNotification(record));
    return record;
  }

  /**
   * Nudges the customer's open tabs that a balance moved.
   *
   * No record and no email: the client refetches the figure rather than being told it, so
   * a stale connection can never leave a wrong balance on screen.
   */
  notifyBalanceChanged(userId: string, accountId: string): void {
    this.stream.publishBalanceChange(userId, accountId);
  }

  async list(input: ListNotificationsInput): Promise<Paginated<Notification>> {
    const cursor = input.cursor ? decodeCursor(input.cursor) : null;

    const page = await this.notifications.list({
      userId: input.userId,
      limit: input.limit,
      unreadOnly: input.unreadOnly,
      ...(cursor ? { cursor } : {}),
      ...(input.category ? { category: input.category } : {}),
    });

    // The page is assembled here rather than through `buildPage`, because the store has
    // already applied the over-fetch and trimmed the extra row. Handing the helper a
    // trimmed list would make it report `hasMore: false` on every page but the last.
    const last = page.records.at(-1);

    return {
      data: page.records.map((record) => toContractNotification(record)),
      page: {
        cursor: page.hasMore && last ? encodeCursor(toCursorPayload(last)) : null,
        limit: input.limit,
        hasMore: page.hasMore,
      },
    };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.notifications.countUnread(userId);
  }

  /** Marks the given notifications read, or all of them when `ids` is empty. */
  async markRead(userId: string, ids: readonly string[]): Promise<number> {
    return this.notifications.markRead(userId, ids, this.clock.now());
  }

  /**
   * Removes notifications past the retention period.
   *
   * Kept for {@link NOTIFICATION_RETENTION_DAYS} — comfortably longer than a year, so a
   * customer looking back at "the alert I got about that payment last spring" still finds
   * it, and short enough that the collection does not grow without limit.
   */
  async purgeExpired(): Promise<number> {
    const cutoff = new Date(
      this.clock.timestamp() - NOTIFICATION_RETENTION_DAYS * HOURS_PER_DAY * MILLISECONDS_PER_HOUR,
    );
    return this.notifications.purgeBefore(cutoff);
  }
}

function toCursorPayload(record: NotificationRecord): CursorPayload {
  return { sortValue: record.createdAt.toISOString(), id: record.id };
}
