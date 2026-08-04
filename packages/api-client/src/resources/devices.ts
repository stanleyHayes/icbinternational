/**
 * Trusted devices and live sessions — the "where am I signed in?" screen.
 *
 * Revoking is modelled as `DELETE` on the session rather than a `POST .../revoke`
 * because a revoked session is genuinely gone: there is no state to transition it to,
 * and the customer's mental model is "remove this".
 */

import {
  acknowledgedSchema,
  deviceSchema,
  paginated,
  resource,
  routes,
  sessionSchema,
  type Acknowledged,
  type CursorQuery,
  type Device,
  type DeviceTrust,
  type Paginated,
  type Resource,
  type Session,
} from '@reliance/contracts';

import type { HttpTransport } from '../core/transport.js';
import type { MutationOptions, QueryOptions } from '../core/types.js';

const deviceList = paginated(deviceSchema);
const deviceResource = resource(deviceSchema);
const sessionList = paginated(sessionSchema);

/** Body of a device trust change. */
export interface UpdateDeviceRequest {
  readonly trust: DeviceTrust;
  readonly label?: string;
}

/** Builds the `client.devices` group. */
export function createDevicesResource(http: HttpTransport) {
  return {
    /** Every device that has signed in to this account. */
    list: (query?: CursorQuery, options?: QueryOptions): Promise<Paginated<Device>> =>
      http.get({ ...options, path: routes.devices.list, query, schema: deviceList }),

    /** A single device. */
    get: (id: string, options?: QueryOptions): Promise<Resource<Device>> =>
      http.get({ ...options, path: routes.devices.byId(id), schema: deviceResource }),

    /** Trusts, un-trusts or blocks a device. */
    update: (
      id: string,
      body: UpdateDeviceRequest,
      options?: MutationOptions,
    ): Promise<Resource<Device>> =>
      http.patch({ ...options, path: routes.devices.byId(id), body, schema: deviceResource }),

    /** Forgets a device, so its next sign-in is treated as new and unrecognised. */
    forget: (id: string, options?: MutationOptions): Promise<Acknowledged> =>
      http.delete({ ...options, path: routes.devices.byId(id), schema: acknowledgedSchema }),

    /** Active sessions. The current one is flagged so the UI never offers to kill it. */
    listSessions: (query?: CursorQuery, options?: QueryOptions): Promise<Paginated<Session>> =>
      http.get({ ...options, path: routes.devices.sessions, query, schema: sessionList }),

    /** Ends one session. */
    revokeSession: (id: string, options?: MutationOptions): Promise<Acknowledged> =>
      http.delete({ ...options, path: routes.devices.session(id), schema: acknowledgedSchema }),

    /** Ends every session except the current one — the "I've been compromised" button. */
    revokeAllSessions: (options?: MutationOptions): Promise<Acknowledged> =>
      http.post({
        ...options,
        path: routes.devices.revokeAllSessions,
        schema: acknowledgedSchema,
      }),
  };
}

/** The `client.devices` group. */
export type DevicesResource = ReturnType<typeof createDevicesResource>;
