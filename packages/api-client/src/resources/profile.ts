/**
 * The customer's own profile, data export and account closure.
 */

import { z } from 'zod';

import {
  acknowledgedSchema,
  mediumTextSchema,
  profileSchema,
  resource,
  routes,
  shortTextSchema,
  type Acknowledged,
  type Profile,
  type Resource,
  type UpdateProfileRequest,
} from '@reliance/contracts';

import type { HttpTransport } from '../core/transport.js';
import type { MutationOptions, QueryOptions } from '../core/types.js';
import { dataExportSchema, type DataExport } from '../provisional/documents.js';

const profileResource = resource(profileSchema);
const exportResource = resource(dataExportSchema);

/** Body of a data-portability request. */
export const requestDataExportSchema = z.object({
  /** Omit to export everything the bank holds. */
  includes: z.array(shortTextSchema).default([]),
  format: z.enum(['JSON', 'CSV', 'ZIP']).default('ZIP'),
});
/** Data-export request. */
export type RequestDataExport = z.infer<typeof requestDataExportSchema>;

/** Body of an account-closure request. */
export const closeCustomerAccountSchema = z.object({
  reason: mediumTextSchema,
  /** Residual balances are swept here before anything is closed. */
  sweepToAccountId: z.string().optional(),
  confirm: z.literal(true),
});
/** Account-closure request. */
export type CloseCustomerAccount = z.infer<typeof closeCustomerAccountSchema>;

/** Builds the `client.profile` group. */
export function createProfileResource(http: HttpTransport) {
  return {
    /** The signed-in customer's profile. */
    get: (options?: QueryOptions): Promise<Resource<Profile>> =>
      http.get({ ...options, path: routes.profile.get, schema: profileResource }),

    /**
     * Updates profile fields. Partial: only the keys present are changed.
     *
     * Changing an address or an income figure can move the customer's risk rating, so
     * the API may answer `KYC_PENDING_REVIEW` rather than applying the change outright.
     */
    update: (body: UpdateProfileRequest, options?: MutationOptions): Promise<Resource<Profile>> =>
      http.patch({ ...options, path: routes.profile.update, body, schema: profileResource }),

    /** Requests a copy of everything the bank holds. Produced asynchronously. */
    requestDataExport: (
      body: RequestDataExport,
      options?: MutationOptions,
    ): Promise<Resource<DataExport>> =>
      http.post({ ...options, path: routes.profile.exportData, body, schema: exportResource }),

    /** Closes the customer relationship. Refused while any account still holds funds. */
    closeAccount: (body: CloseCustomerAccount, options?: MutationOptions): Promise<Acknowledged> =>
      http.post({
        ...options,
        path: routes.profile.closeAccount,
        body,
        schema: acknowledgedSchema,
      }),
  };
}

/** The `client.profile` group. */
export type ProfileResource = ReturnType<typeof createProfileResource>;
