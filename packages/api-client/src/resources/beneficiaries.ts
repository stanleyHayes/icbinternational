/**
 * Saved payees.
 *
 * `verifyName` exists so the customer is told "this account belongs to J. Smith, not
 * John Smith" *before* the money moves. It is the single most effective control against
 * authorised-push-payment fraud, which is why it is a first-class route rather than
 * something folded into the quote.
 */

import { z } from 'zod';

import {
  acknowledgedSchema,
  beneficiarySchema,
  paginated,
  resource,
  routes,
  type Acknowledged,
  type Beneficiary,
  type CreateBeneficiaryRequest,
  type NameCheckResult,
  type Paginated,
  type Resource,
  type TransferDestination,
} from '@reliance/contracts';

import type { HttpTransport } from '../core/transport.js';
import type { MutationOptions, QueryOptions } from '../core/types.js';

const beneficiaryList = paginated(beneficiarySchema);
const beneficiaryResource = resource(beneficiarySchema);

/** Outcome of a confirmation-of-payee check. */
export const nameCheckSchema = z.object({
  result: z.enum(['MATCH', 'CLOSE_MATCH', 'NO_MATCH', 'UNAVAILABLE']),
  /** The name the receiving bank holds, when it is willing to disclose it. */
  suggestion: z.string().nullable(),
  message: z.string(),
});
/** A confirmation-of-payee result. */
export type NameCheck = z.infer<typeof nameCheckSchema>;

const nameCheckResource = resource(nameCheckSchema);

/** Body of a confirmation-of-payee check. */
export interface VerifyNameRequest {
  readonly destination: TransferDestination;
  readonly expectedName: string;
}

/** Filters for the beneficiary list. */
export type ListBeneficiariesQuery = {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly currency?: string | undefined;
  readonly favouritesOnly?: boolean | undefined;
  readonly search?: string | undefined;
};

/** Body of a beneficiary update. */
export interface UpdateBeneficiaryRequest {
  readonly nickname?: string;
  readonly isFavourite?: boolean;
}

/** Builds the `client.beneficiaries` group. */
export function createBeneficiariesResource(http: HttpTransport) {
  return {
    /** Saved payees. */
    list: (
      query?: ListBeneficiariesQuery,
      options?: QueryOptions,
    ): Promise<Paginated<Beneficiary>> =>
      http.get({ ...options, path: routes.beneficiaries.list, query, schema: beneficiaryList }),

    /**
     * Saves a payee.
     *
     * New payees enter a cooling-off window before large payments to them are allowed;
     * `trustedFrom` on the response says when that window ends.
     */
    create: (
      body: CreateBeneficiaryRequest,
      options?: MutationOptions,
    ): Promise<Resource<Beneficiary>> =>
      http.post({
        ...options,
        path: routes.beneficiaries.create,
        body,
        schema: beneficiaryResource,
      }),

    /** One payee. */
    get: (id: string, options?: QueryOptions): Promise<Resource<Beneficiary>> =>
      http.get({ ...options, path: routes.beneficiaries.byId(id), schema: beneficiaryResource }),

    /** Renames a payee or toggles its favourite flag. */
    update: (
      id: string,
      body: UpdateBeneficiaryRequest,
      options?: MutationOptions,
    ): Promise<Resource<Beneficiary>> =>
      http.patch({
        ...options,
        path: routes.beneficiaries.byId(id),
        body,
        schema: beneficiaryResource,
      }),

    /** Removes a payee. Past transfers to them are untouched. */
    remove: (id: string, options?: MutationOptions): Promise<Acknowledged> =>
      http.delete({
        ...options,
        path: routes.beneficiaries.byId(id),
        schema: acknowledgedSchema,
      }),

    /** Checks a name against the receiving bank before any money moves. */
    verifyName: (
      body: VerifyNameRequest,
      options?: MutationOptions,
    ): Promise<Resource<NameCheck>> =>
      http.post({
        ...options,
        path: routes.beneficiaries.verifyName,
        body,
        schema: nameCheckResource,
      }),
  };
}

/** The `client.beneficiaries` group. */
export type BeneficiariesResource = ReturnType<typeof createBeneficiariesResource>;

/** Re-exported so a caller can narrow on the check outcome without importing contracts. */
export type { NameCheckResult };
