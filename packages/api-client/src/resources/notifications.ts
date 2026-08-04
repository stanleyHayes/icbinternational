/**
 * Notifications, preferences and the live event stream.
 *
 * `streamUrl` returns a URL rather than opening the connection. `EventSource` and its
 * React lifecycle belong to the app: a client that owned the socket would have to own
 * reconnection, backoff and teardown too, and would fight whatever the app already does.
 */

import {
  acknowledgedSchema,
  notificationPreferencesSchema,
  notificationSchema,
  paginated,
  resource,
  routes,
  type Acknowledged,
  type Notification,
  type NotificationCategory,
  type NotificationPreferences,
  type Paginated,
  type PushSubscriptionRequest,
  type Resource,
} from '@reliance/contracts';

import type { ResolvedConfig } from '../core/config.js';
import { joinUrl } from '../core/query.js';
import type { HttpTransport } from '../core/transport.js';
import type { MutationOptions, QueryOptions } from '../core/types.js';

const notificationList = paginated(notificationSchema);
const preferencesResource = resource(notificationPreferencesSchema);

/** Filters for the notification list. */
export type ListNotificationsQuery = {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly category?: NotificationCategory | undefined;
  readonly unreadOnly?: boolean | undefined;
};

/** Body of a mark-read call. An empty `ids` array marks everything read. */
export interface MarkReadRequest {
  readonly ids?: readonly string[];
}

/** Builds the `client.notifications` group. */
export function createNotificationsResource(http: HttpTransport, config: ResolvedConfig) {
  return {
    /** The notification feed. */
    list: (
      query?: ListNotificationsQuery,
      options?: QueryOptions,
    ): Promise<Paginated<Notification>> =>
      http.get({
        ...options,
        path: routes.notifications.list,
        query,
        schema: notificationList,
      }),

    /** Marks specific notifications read, or all of them when `ids` is empty. */
    markRead: (body: MarkReadRequest = {}, options?: MutationOptions): Promise<Acknowledged> =>
      http.post({
        ...options,
        path: routes.notifications.markRead,
        body: { ids: body.ids ?? [] },
        schema: acknowledgedSchema,
      }),

    /** The category-by-channel preference matrix. */
    preferences: (options?: QueryOptions): Promise<Resource<NotificationPreferences>> =>
      http.get({
        ...options,
        path: routes.notifications.preferences,
        schema: preferencesResource,
      }),

    /**
     * Replaces the preference matrix.
     *
     * `SECURITY` cannot be switched off on any channel. The API enforces it and will
     * quietly re-enable it in the response rather than rejecting the whole update.
     */
    updatePreferences: (
      body: NotificationPreferences,
      options?: MutationOptions,
    ): Promise<Resource<NotificationPreferences>> =>
      http.put({
        ...options,
        path: routes.notifications.preferences,
        body,
        schema: preferencesResource,
      }),

    /**
     * URL for the server-sent event stream.
     *
     * Open it with `new EventSource(url, { withCredentials: true })`; events conform to
     * the contract's `notificationStreamEventSchema`.
     */
    streamUrl: (): string =>
      joinUrl(config.baseUrl, `${config.prefix}${routes.notifications.stream}`),

    /** Registers a web-push endpoint for this browser. */
    subscribeToPush: (
      body: PushSubscriptionRequest,
      options?: MutationOptions,
    ): Promise<Acknowledged> =>
      http.post({
        ...options,
        path: routes.notifications.pushSubscribe,
        body,
        schema: acknowledgedSchema,
      }),
  };
}

/** The `client.notifications` group. */
export type NotificationsResource = ReturnType<typeof createNotificationsResource>;
