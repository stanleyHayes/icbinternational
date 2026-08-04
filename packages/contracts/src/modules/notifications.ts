/**
 * Notifications and the customer's control over them.
 *
 * Preferences are a matrix of category × channel, with one hard rule the API enforces:
 * a `SECURITY` notification is always delivered, whatever the customer has muted. You do
 * not get to opt out of being told someone logged into your bank account.
 */

import { z } from 'zod';

import { cursorQuerySchema } from '../common/envelope.js';
import {
  entityId,
  isoDateTimeSchema,
  mediumTextSchema,
  shortTextSchema,
} from '../common/primitives.js';

export const NotificationCategory = {
  SECURITY: 'SECURITY',
  TRANSACTION: 'TRANSACTION',
  ACCOUNT: 'ACCOUNT',
  CARD: 'CARD',
  LENDING: 'LENDING',
  SAVINGS: 'SAVINGS',
  SUPPORT: 'SUPPORT',
  STATEMENT: 'STATEMENT',
  MARKETING: 'MARKETING',
  SYSTEM: 'SYSTEM',
} as const;
export type NotificationCategory = (typeof NotificationCategory)[keyof typeof NotificationCategory];

/** Categories the customer cannot switch off, on any channel. */
export const MANDATORY_CATEGORIES: readonly NotificationCategory[] = Object.freeze([
  NotificationCategory.SECURITY,
]);

export const NotificationChannel = {
  IN_APP: 'IN_APP',
  EMAIL: 'EMAIL',
  SMS: 'SMS',
  PUSH: 'PUSH',
} as const;
export type NotificationChannel = (typeof NotificationChannel)[keyof typeof NotificationChannel];

export const NotificationSeverity = {
  INFO: 'INFO',
  SUCCESS: 'SUCCESS',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL',
} as const;
export type NotificationSeverity = (typeof NotificationSeverity)[keyof typeof NotificationSeverity];

export const notificationSchema = z.object({
  id: entityId('ntf'),
  category: z.enum(NotificationCategory),
  severity: z.enum(NotificationSeverity),
  title: shortTextSchema,
  body: mediumTextSchema,
  /** Deep link into the app, e.g. `/accounts/acc_.../transactions/txn_...`. */
  actionUrl: z.string().nullable(),
  actionLabel: shortTextSchema.nullable(),
  iconKey: shortTextSchema.nullable(),
  read: z.boolean(),
  createdAt: isoDateTimeSchema,
  readAt: isoDateTimeSchema.nullable(),
});
export type Notification = z.infer<typeof notificationSchema>;

export const listNotificationsQuerySchema = cursorQuerySchema.extend({
  category: z.enum(NotificationCategory).optional(),
  unreadOnly: z.coerce.boolean().default(false),
});

export const markReadRequestSchema = z.object({
  /** Empty array marks everything read. */
  ids: z.array(entityId('ntf')).default([]),
});

export const channelPreferenceSchema = z.object({
  category: z.enum(NotificationCategory),
  inApp: z.boolean(),
  email: z.boolean(),
  sms: z.boolean(),
  push: z.boolean(),
});
export type ChannelPreference = z.infer<typeof channelPreferenceSchema>;

export const notificationPreferencesSchema = z.object({
  preferences: z.array(channelPreferenceSchema),
  /** Non-critical notifications are held until quiet hours end. */
  quietHours: z
    .object({ from: z.string().regex(/^\d{2}:\d{2}$/), to: z.string().regex(/^\d{2}:\d{2}$/) })
    .nullable(),
  timezone: z.string(),
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

export const pushSubscriptionRequestSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
  deviceLabel: shortTextSchema.optional(),
});
export type PushSubscriptionRequest = z.infer<typeof pushSubscriptionRequestSchema>;

/** Server-sent event pushed down the live notification stream. */
export const notificationStreamEventSchema = z.discriminatedUnion('event', [
  z.object({ event: z.literal('notification'), data: notificationSchema }),
  z.object({ event: z.literal('balance'), data: z.object({ accountId: entityId('acc') }) }),
  z.object({ event: z.literal('heartbeat'), data: z.object({ at: isoDateTimeSchema }) }),
]);
export type NotificationStreamEvent = z.infer<typeof notificationStreamEventSchema>;
