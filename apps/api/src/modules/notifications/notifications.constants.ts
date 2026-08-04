/**
 * Collection names, model tokens and the timings the notification platform runs on.
 *
 * One value in this file is a rule rather than a setting: {@link ALWAYS_DELIVER_CATEGORIES}.
 * Everything else can be tuned; that one cannot, and the preference matrix reads it rather
 * than re-deciding.
 */

import { NotificationCategory, NotificationChannel } from '@reliance/contracts';

export const NOTIFICATION_COLLECTION = 'notifications';
export const NOTIFICATION_MODEL = 'Notification';

export const PREFERENCE_COLLECTION = 'notification_preferences';
export const PREFERENCE_MODEL = 'NotificationPreference';

export const DELIVERY_COLLECTION = 'notification_deliveries';
export const DELIVERY_MODEL = 'NotificationDelivery';

export const ADDRESS_HEALTH_COLLECTION = 'notification_address_health';
export const ADDRESS_HEALTH_MODEL = 'NotificationAddressHealth';

export const PUSH_SUBSCRIPTION_COLLECTION = 'push_subscriptions';
export const PUSH_SUBSCRIPTION_MODEL = 'PushSubscription';

export const DIGEST_COLLECTION = 'notification_digests';
export const DIGEST_MODEL = 'NotificationDigest';

/**
 * Categories that reach the customer whatever they have muted.
 *
 * Nobody opts out of being told that someone signed into their bank account, moved their
 * money, or changed the address statements are posted to. The preference matrix will
 * happily record that a customer switched `SECURITY` off — the UI does not offer it, but
 * a stale client could — and the resolver ignores the stored value. Refusing to *store*
 * the preference would be the weaker control: it would put the rule in a validator that a
 * future endpoint could forget to call, instead of in the one place delivery is decided.
 */
export const ALWAYS_DELIVER_CATEGORIES: readonly NotificationCategory[] = Object.freeze([
  NotificationCategory.SECURITY,
]);

/** Channels a mandatory notification is pushed down regardless of preference. */
export const MANDATORY_CHANNELS: readonly NotificationChannel[] = Object.freeze([
  NotificationChannel.IN_APP,
  NotificationChannel.EMAIL,
]);

/** Every channel, in the order the preference screen lists them. */
export const ALL_CHANNELS: readonly NotificationChannel[] = Object.freeze([
  NotificationChannel.IN_APP,
  NotificationChannel.EMAIL,
  NotificationChannel.SMS,
  NotificationChannel.PUSH,
]);

/** Every category, in the order the preference screen lists them. */
export const ALL_CATEGORIES: readonly NotificationCategory[] = Object.freeze([
  NotificationCategory.SECURITY,
  NotificationCategory.TRANSACTION,
  NotificationCategory.ACCOUNT,
  NotificationCategory.CARD,
  NotificationCategory.LENDING,
  NotificationCategory.SAVINGS,
  NotificationCategory.SUPPORT,
  NotificationCategory.STATEMENT,
  NotificationCategory.MARKETING,
  NotificationCategory.SYSTEM,
]);

/** How long an unread in-app notification is kept before the retention sweep removes it. */
export const NOTIFICATION_RETENTION_DAYS = 400;

/** Attempts a single delivery gets before it is abandoned. */
export const MAX_DELIVERY_ATTEMPTS = 5;

/** First retry delay in seconds; each further attempt doubles it. */
export const RETRY_BASE_SECONDS = 30;

/** Ceiling on the backoff, so a long outage does not push a retry days into the future. */
export const RETRY_MAX_SECONDS = 3600;

/**
 * Hard bounces before an address is treated as degraded and skipped.
 *
 * One. A hard bounce is the receiving server saying the mailbox does not exist, which is
 * not a condition that improves on the second attempt — and continuing to send to it is
 * exactly what damages the sending reputation the security emails depend on. Soft bounces
 * (a full mailbox, a greylist) are counted separately and never degrade an address on
 * their own; the retry budget is what handles those.
 */
export const BOUNCE_DEGRADED_THRESHOLD = 1;

/** A complaint is a single, immediate, permanent signal. One is enough. */
export const COMPLAINT_DEGRADED_THRESHOLD = 1;

/** How often the sweeper looks for deliveries that are due a retry, in milliseconds. */
export const RETRY_SWEEP_INTERVAL_MS = 30_000;

/** Heartbeat cadence on the live stream, in milliseconds. Keeps proxies from idling it out. */
export const STREAM_HEARTBEAT_MS = 25_000;

/** Live-stream connections a single customer may hold at once, across their devices. */
export const MAX_STREAM_SUBSCRIBERS_PER_USER = 8;

/** Default quiet window offered on the preferences screen, in the customer's own timezone. */
export const DEFAULT_QUIET_HOURS = Object.freeze({ from: '22:00', to: '07:00' });

/** Timezone assumed until the customer sets one. */
export const DEFAULT_TIMEZONE = 'Europe/London';

/** Notifications rolled into one digest before it is sent regardless of the window. */
export const DIGEST_MAX_ITEMS = 25;

/** How long a digest accumulates before it is sent, in minutes. */
export const DIGEST_WINDOW_MINUTES = 240;
