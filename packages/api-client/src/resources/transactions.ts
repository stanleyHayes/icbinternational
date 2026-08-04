/**
 * The transaction feed.
 *
 * Cursor pagination only. The feed is written to constantly, and an offset-paged second
 * page skips or repeats rows against a moving collection — on a bank statement that
 * looks exactly like money disappearing.
 */

import {
  paginated,
  resource,
  routes,
  transactionSchema,
  type CursorQuery,
  type ExportTransactionsQuery,
  type ListTransactionsQuery,
  type Paginated,
  type Resource,
  type Transaction,
  type UpdateTransactionRequest,
} from '@reliance/contracts';

import type { HttpTransport } from '../core/transport.js';
import type { MutationOptions, QueryOptions } from '../core/types.js';
import {
  documentJobSchema,
  transactionReceiptSchema,
  type DocumentJob,
  type TransactionReceipt,
} from '../provisional/documents.js';

const transactionList = paginated(transactionSchema);
const transactionResource = resource(transactionSchema);
const receiptResource = resource(transactionReceiptSchema);
const jobResource = resource(documentJobSchema);

/** Builds the `client.transactions` group. */
export function createTransactionsResource(http: HttpTransport) {
  return {
    /**
     * The feed, filtered and paged.
     *
     * Follow `page.cursor` for the next page; a `null` cursor means the list is
     * exhausted. Never derive the next page from an item index.
     */
    list: (
      query?: ListTransactionsQuery,
      options?: QueryOptions,
    ): Promise<Paginated<Transaction>> =>
      http.get({ ...options, path: routes.transactions.list, query, schema: transactionList }),

    /** One transaction, with its counterparty and running balance. */
    get: (id: string, options?: QueryOptions): Promise<Resource<Transaction>> =>
      http.get({ ...options, path: routes.transactions.byId(id), schema: transactionResource }),

    /**
     * Recategorises a transaction or attaches a note.
     *
     * Only presentation changes: the amount, the direction and the posting behind them
     * are immutable. A correction to the money itself is a reversing journal entry, not
     * an edit here.
     */
    update: (
      id: string,
      body: UpdateTransactionRequest,
      options?: MutationOptions,
    ): Promise<Resource<Transaction>> =>
      http.patch({
        ...options,
        path: routes.transactions.update(id),
        body,
        schema: transactionResource,
      }),

    /** A shareable receipt for one transaction. */
    receipt: (id: string, options?: QueryOptions): Promise<Resource<TransactionReceipt>> =>
      http.get({ ...options, path: routes.transactions.receipt(id), schema: receiptResource }),

    /** Starts an export. Produced asynchronously; poll the returned job for the URL. */
    export: (
      body: ExportTransactionsQuery,
      options?: MutationOptions,
    ): Promise<Resource<DocumentJob>> =>
      http.post({ ...options, path: routes.transactions.export, body, schema: jobResource }),
  };
}

/** The `client.transactions` group. */
export type TransactionsResource = ReturnType<typeof createTransactionsResource>;

/** Query type for the paged feed, re-exported for callers building filter state. */
export type TransactionFeedQuery = ListTransactionsQuery & CursorQuery;
