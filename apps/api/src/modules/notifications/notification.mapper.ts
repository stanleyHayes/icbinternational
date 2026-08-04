import { type Notification } from '@reliance/contracts';

import { type NotificationRecord } from './notification.store.js';

/**
 * Stored record → contract shape.
 *
 * `templateKey` is deliberately not on the wire. It is an internal name that would tempt a
 * client into branching on it, and the day a template is renamed that branch breaks
 * silently. The client gets the category and the severity, which are contract vocabulary
 * and are what a rendering decision should be made from.
 */
export function toContractNotification(record: NotificationRecord): Notification {
  return {
    id: record.id,
    category: record.category,
    severity: record.severity,
    title: record.title,
    body: record.body,
    actionUrl: record.actionUrl,
    actionLabel: record.actionLabel,
    iconKey: record.iconKey,
    read: record.read,
    createdAt: record.createdAt.toISOString(),
    readAt: record.readAt?.toISOString() ?? null,
  };
}
