/**
 * Outbound transfers: quote, review, authorise, track.
 *
 * `create` binds to a `quoteId` rather than repeating the amount and destination. That
 * is what stops a customer being repriced between seeing a rate and accepting it — if
 * the quote has expired the API refuses with `QUOTE_EXPIRED` instead of quietly
 * executing at today's rate.
 */

import {
  paginated,
  resource,
  routes,
  transferQuoteSchema,
  transferSchema,
  type CreateTransferRequest,
  type Paginated,
  type Resource,
  type Transfer,
  type TransferQuote,
  type TransferQuoteRequest,
  type TransferRail,
  type TransferStatus,
} from '@reliance/contracts';

import { withIdempotencyKey } from '../core/idempotency.js';
import type { HttpTransport } from '../core/transport.js';
import type { MutationOptions, QueryOptions } from '../core/types.js';

const quoteResource = resource(transferQuoteSchema);
const transferResource = resource(transferSchema);
const transferList = paginated(transferSchema);

/** Filters for the transfer list. */
export type ListTransfersQuery = {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly status?: TransferStatus | undefined;
  readonly rail?: TransferRail | undefined;
  readonly sourceAccountId?: string | undefined;
};

/** Builds the `client.transfers` group. */
export function createTransfersResource(http: HttpTransport) {
  return {
    /**
     * Prices a transfer without moving anything.
     *
     * The quote names the rail, the fee, the exchange rate and whether step-up
     * authentication will be demanded — everything the review screen must show before
     * the customer commits.
     */
    quote: (
      body: TransferQuoteRequest,
      options?: MutationOptions,
    ): Promise<Resource<TransferQuote>> =>
      http.post({ ...options, path: routes.transfers.quote, body, schema: quoteResource }),

    /**
     * Executes a quoted transfer.
     *
     * The API requires an idempotency key here. One is minted when the caller does not
     * supply it, which makes a single call safe — but supply your own via
     * {@link withIdempotencyKey} and reuse it across retries, or a timeout followed by a
     * retry sends the money twice.
     */
    create: (body: CreateTransferRequest, options?: MutationOptions): Promise<Resource<Transfer>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.transfers.create,
        body,
        schema: transferResource,
      }),

    /** Transfers the customer has made, newest first. */
    list: (query?: ListTransfersQuery, options?: QueryOptions): Promise<Paginated<Transfer>> =>
      http.get({ ...options, path: routes.transfers.list, query, schema: transferList }),

    /** One transfer, with its full status timeline. */
    get: (id: string, options?: QueryOptions): Promise<Resource<Transfer>> =>
      http.get({ ...options, path: routes.transfers.byId(id), schema: transferResource }),

    /**
     * Cancels a transfer that has not left the bank.
     *
     * Answers `TRANSFER_NOT_CANCELLABLE` once the rail has it: at that point recall is a
     * support case, not an API call, and pretending otherwise would mislead the user.
     */
    cancel: (id: string, options?: MutationOptions): Promise<Resource<Transfer>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.transfers.cancel(id),
        schema: transferResource,
      }),
  };
}

/** The `client.transfers` group. */
export type TransfersResource = ReturnType<typeof createTransfersResource>;
