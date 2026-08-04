/**
 * Foreign exchange.
 *
 * `convert` takes a `quoteId` and nothing else. The rate, the spread and the amounts are
 * all fixed at quote time, so there is no field a caller could pass that would let the
 * executed conversion differ from the one they were shown.
 */

import {
  fxAlertSchema,
  fxBoardSchema,
  fxQuoteSchema,
  fxRateSchema,
  paginated,
  resource,
  routes,
  type CreateFxAlertRequest,
  type CursorQuery,
  type FxAlert,
  type FxBoard,
  type FxQuote,
  type FxQuoteRequest,
  type FxRate,
  type Paginated,
  type Resource,
  transferSchema,
  type Transfer,
} from '@reliance/contracts';

import { withIdempotencyKey } from '../core/idempotency.js';
import type { HttpTransport } from '../core/transport.js';
import type { MutationOptions, QueryOptions } from '../core/types.js';

const rateList = paginated(fxRateSchema);
const boardResource = resource(fxBoardSchema);
const quoteResource = resource(fxQuoteSchema);
const alertList = paginated(fxAlertSchema);
const alertResource = resource(fxAlertSchema);
const transferResource = resource(transferSchema);

/** Filters for the rate list. */
export type FxRatesQuery = {
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
};

/** Which base currency the board is quoted against. */
export type FxBoardQuery = {
  readonly base?: string | undefined;
};

/** Builds the `client.fx` group. */
export function createFxResource(http: HttpTransport) {
  return {
    /** Individual pair rates, with the change against the previous close. */
    rates: (query?: FxRatesQuery, options?: QueryOptions): Promise<Paginated<FxRate>> =>
      http.get({ ...options, path: routes.fx.rates, query, schema: rateList }),

    /** The whole board against one base currency. */
    board: (query?: FxBoardQuery, options?: QueryOptions): Promise<Resource<FxBoard>> =>
      http.get({ ...options, path: routes.fx.board, query, schema: boardResource }),

    /**
     * Locks a rate for a short window.
     *
     * Supply exactly one of `sellAmount` or `buyAmount` — fix what you spend, or fix
     * what you receive. The quote states the spread as money as well as basis points, so
     * the cost is never hidden inside the rate.
     */
    quote: (body: FxQuoteRequest, options?: MutationOptions): Promise<Resource<FxQuote>> =>
      http.post({ ...options, path: routes.fx.quote, body, schema: quoteResource }),

    /** Executes a quoted conversion. Refused with `QUOTE_EXPIRED` past the window. */
    convert: (quoteId: string, options?: MutationOptions): Promise<Resource<Transfer>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.fx.convert,
        body: { quoteId },
        schema: transferResource,
      }),

    /** Rate alerts the customer has set. */
    listAlerts: (query?: CursorQuery, options?: QueryOptions): Promise<Paginated<FxAlert>> =>
      http.get({ ...options, path: routes.fx.alerts, query, schema: alertList }),

    /** Sets a rate alert. */
    createAlert: (
      body: CreateFxAlertRequest,
      options?: MutationOptions,
    ): Promise<Resource<FxAlert>> =>
      http.post({ ...options, path: routes.fx.alerts, body, schema: alertResource }),

    /** One alert. */
    getAlert: (id: string, options?: QueryOptions): Promise<Resource<FxAlert>> =>
      http.get({ ...options, path: routes.fx.alert(id), schema: alertResource }),

    /** Removes an alert. */
    deleteAlert: (id: string, options?: MutationOptions): Promise<Resource<FxAlert>> =>
      http.delete({ ...options, path: routes.fx.alert(id), schema: alertResource }),
  };
}

/** The `client.fx` group. */
export type FxResource = ReturnType<typeof createFxResource>;
