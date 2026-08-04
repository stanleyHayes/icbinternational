/**
 * Standing orders and scheduled transfers.
 *
 * `skip` and `pause` are separate verbs because they mean different things to a
 * customer: skip drops the next occurrence and leaves the schedule running, pause stops
 * the schedule until it is resumed. Collapsing them into one `PATCH status` would make
 * "just skip this month" indistinguishable from "stop paying my rent".
 */

import {
  acknowledgedSchema,
  paginated,
  resource,
  routes,
  transferOrderSchema,
  type Acknowledged,
  type CreateTransferOrderRequest,
  type Paginated,
  type Resource,
  type TransferOrder,
  type TransferOrderStatus,
} from '@reliance/contracts';

import { withIdempotencyKey } from '../core/idempotency.js';
import type { HttpTransport } from '../core/transport.js';
import type { MutationOptions, QueryOptions } from '../core/types.js';

const orderList = paginated(transferOrderSchema);
const orderResource = resource(transferOrderSchema);

/** Filters for the standing-order list. */
export type ListTransferOrdersQuery = {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly status?: TransferOrderStatus | undefined;
  readonly sourceAccountId?: string | undefined;
};

/** Body of a standing-order amendment. */
export type UpdateTransferOrderRequest = Partial<
  Pick<CreateTransferOrderRequest, 'name' | 'amount' | 'reference' | 'endsOn' | 'maxOccurrences'>
>;

/** Body of a pause/resume. */
export interface PauseTransferOrderRequest {
  readonly paused: boolean;
  /** Absent means "until resumed". */
  readonly resumeOn?: string;
}

/** Builds the `client.transferOrders` group. */
export function createTransferOrdersResource(http: HttpTransport) {
  return {
    /** Standing orders and future-dated transfers. */
    list: (
      query?: ListTransferOrdersQuery,
      options?: QueryOptions,
    ): Promise<Paginated<TransferOrder>> =>
      http.get({ ...options, path: routes.transferOrders.list, query, schema: orderList }),

    /** Creates a standing order. Month-ends clamp rather than skip. */
    create: (
      body: CreateTransferOrderRequest,
      options?: MutationOptions,
    ): Promise<Resource<TransferOrder>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.transferOrders.create,
        body,
        schema: orderResource,
      }),

    /** One standing order, including when it next runs. */
    get: (id: string, options?: QueryOptions): Promise<Resource<TransferOrder>> =>
      http.get({ ...options, path: routes.transferOrders.byId(id), schema: orderResource }),

    /** Amends a standing order. */
    update: (
      id: string,
      body: UpdateTransferOrderRequest,
      options?: MutationOptions,
    ): Promise<Resource<TransferOrder>> =>
      http.patch({
        ...options,
        path: routes.transferOrders.byId(id),
        body,
        schema: orderResource,
      }),

    /** Cancels a standing order outright. */
    cancel: (id: string, options?: MutationOptions): Promise<Acknowledged> =>
      http.delete({
        ...options,
        path: routes.transferOrders.byId(id),
        schema: acknowledgedSchema,
      }),

    /** Drops the next occurrence only; the schedule carries on afterwards. */
    skipNext: (id: string, options?: MutationOptions): Promise<Resource<TransferOrder>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.transferOrders.skip(id),
        schema: orderResource,
      }),

    /** Pauses or resumes the whole schedule. */
    setPaused: (
      id: string,
      body: PauseTransferOrderRequest,
      options?: MutationOptions,
    ): Promise<Resource<TransferOrder>> =>
      http.post({
        ...options,
        path: routes.transferOrders.pause(id),
        body,
        schema: orderResource,
      }),
  };
}

/** The `client.transferOrders` group. */
export type TransferOrdersResource = ReturnType<typeof createTransferOrdersResource>;
