/**
 * Bulk payment files.
 *
 * Upload, validate, approve, execute — in that order and never fewer steps. A bulk file
 * is the highest-value single request a business customer ever makes, so the validated
 * batch is presented for a human decision before anything is posted.
 */

import {
  bulkTransferSchema,
  resource,
  routes,
  type BulkTransfer,
  type Resource,
} from '@reliance/contracts';

import { withIdempotencyKey } from '../core/idempotency.js';
import type { HttpTransport } from '../core/transport.js';
import type { MutationOptions, QueryOptions } from '../core/types.js';

const bulkResource = resource(bulkTransferSchema);

/** One row of a bulk file, as submitted. */
export interface BulkTransferInput {
  readonly accountName: string;
  readonly accountNumber: string;
  readonly sortCode: string;
  readonly amount: { readonly amount: string; readonly currency: string };
  readonly reference?: string;
}

/** Body of a bulk-file submission. */
export interface CreateBulkTransferRequest {
  readonly sourceAccountId: string;
  readonly fileName: string;
  readonly rows: readonly BulkTransferInput[];
}

/** Body of a bulk-file approval. */
export interface ApproveBulkTransferRequest {
  readonly decision: 'APPROVE' | 'REJECT';
  readonly note?: string;
}

/** Builds the `client.bulkTransfers` group. */
export function createBulkTransfersResource(http: HttpTransport) {
  return {
    /**
     * Submits a parsed file for validation.
     *
     * Answers with every row marked `VALID` or `INVALID` and nothing posted. Validation
     * is a read, however large the file: money moves only once `approve` is called.
     */
    create: (
      body: CreateBulkTransferRequest,
      options?: MutationOptions,
    ): Promise<Resource<BulkTransfer>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.bulkTransfers.create,
        body,
        schema: bulkResource,
      }),

    /** One batch and the current state of every row in it. */
    get: (id: string, options?: QueryOptions): Promise<Resource<BulkTransfer>> =>
      http.get({ ...options, path: routes.bulkTransfers.byId(id), schema: bulkResource }),

    /** Approves or rejects a validated batch. Approval is what starts the payments. */
    approve: (
      id: string,
      body: ApproveBulkTransferRequest,
      options?: MutationOptions,
    ): Promise<Resource<BulkTransfer>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.bulkTransfers.approve(id),
        body,
        schema: bulkResource,
      }),
  };
}

/** The `client.bulkTransfers` group. */
export type BulkTransfersResource = ReturnType<typeof createBulkTransfersResource>;
