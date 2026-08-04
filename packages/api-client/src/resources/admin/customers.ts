/**
 * Admin: staff identity, customers, KYC adjudication and screening.
 *
 * `impersonate` requires a written justification because the audit chain records it
 * verbatim. Looking at a customer's account without saying why is not a supported
 * operation, and the contract is where that is enforced rather than a policy document.
 */

import {
  acknowledgedSchema,
  adminUserSchema,
  kycCaseSchema,
  paginated,
  resource,
  routes,
  userSchema,
  type Acknowledged,
  type AdminUser,
  type CursorQuery,
  type KycCase,
  type KycStatus,
  type Paginated,
  type Resource,
  type User,
  type UserStatus,
} from '@reliance/contracts';

import { withIdempotencyKey } from '../../core/idempotency.js';
import type { HttpTransport } from '../../core/transport.js';
import type { MutationOptions, QueryOptions } from '../../core/types.js';
import {
  impersonationGrantSchema,
  screeningHitSchema,
  type ImpersonationGrant,
  type ScreeningHit,
} from '../../provisional/operations.js';

const adminResource = resource(adminUserSchema);
const customerList = paginated(userSchema);
const customerResource = resource(userSchema);
const kycList = paginated(kycCaseSchema);
const kycResource = resource(kycCaseSchema);
const screeningList = paginated(screeningHitSchema);
const impersonationResource = resource(impersonationGrantSchema);

/** Body of a staff login. */
export interface AdminLoginRequest {
  readonly email: string;
  readonly password: string;
  readonly totpCode: string;
}

/** Filters for the customer search. */
export type SearchCustomersQuery = {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly search?: string | undefined;
  readonly status?: UserStatus | undefined;
  readonly kycTier?: number | undefined;
  readonly segment?: string | undefined;
};

/** Filters for the KYC queue. */
export type KycQueueQuery = {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly status?: KycStatus | undefined;
  readonly assignedToId?: string | undefined;
};

/** Body of a customer freeze or unfreeze. */
export interface FreezeCustomerRequest {
  readonly frozen: boolean;
  readonly reason: string;
}

/** Body of a KYC decision. */
export interface DecideKycRequest {
  readonly decision: 'APPROVE' | 'REJECT' | 'REQUEST_MORE_INFO';
  readonly grantedTier?: number;
  readonly reviewerMessage?: string;
  readonly riskRating?: 'LOW' | 'MEDIUM' | 'HIGH' | 'PROHIBITED';
}

/** Body of an impersonation request. */
export interface ImpersonateRequest {
  readonly justification: string;
  readonly readOnly: boolean;
}

/** Builds the customer-facing half of `client.admin`. */
export function createAdminCustomersResource(http: HttpTransport) {
  return {
    /** Staff sign-in. Always requires a second factor; there is no password-only path. */
    login: (body: AdminLoginRequest, options?: MutationOptions): Promise<Resource<AdminUser>> =>
      http.post({
        ...options,
        path: routes.admin.login,
        body,
        schema: adminResource,
        allowRefresh: false,
      }),

    /** The signed-in staff member, with their resolved permission list. */
    me: (options?: QueryOptions): Promise<Resource<AdminUser>> =>
      http.get({ ...options, path: routes.admin.me, schema: adminResource }),

    /** Customer search. */
    customers: (query?: SearchCustomersQuery, options?: QueryOptions): Promise<Paginated<User>> =>
      http.get({ ...options, path: routes.admin.customers, query, schema: customerList }),

    /** One customer. */
    customer: (id: string, options?: QueryOptions): Promise<Resource<User>> =>
      http.get({ ...options, path: routes.admin.customer(id), schema: customerResource }),

    /** Freezes or unfreezes a customer, with the reason recorded in the audit chain. */
    freezeCustomer: (
      id: string,
      body: FreezeCustomerRequest,
      options?: MutationOptions,
    ): Promise<Resource<User>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.admin.freezeCustomer(id),
        body,
        schema: customerResource,
      }),

    /** Issues a time-boxed impersonation grant. Read-only unless explicitly asked for. */
    impersonate: (
      id: string,
      body: ImpersonateRequest,
      options?: MutationOptions,
    ): Promise<Resource<ImpersonationGrant>> =>
      http.post({
        ...options,
        path: routes.admin.impersonate(id),
        body,
        schema: impersonationResource,
      }),

    /** The KYC review queue. */
    kycQueue: (query?: KycQueueQuery, options?: QueryOptions): Promise<Paginated<KycCase>> =>
      http.get({ ...options, path: routes.admin.kycQueue, query, schema: kycList }),

    /** One KYC case, with every document attached to it. */
    kycCase: (id: string, options?: QueryOptions): Promise<Resource<KycCase>> =>
      http.get({ ...options, path: routes.admin.kycCase(id), schema: kycResource }),

    /** Approves, rejects, or asks the customer for more. */
    decideKyc: (
      id: string,
      body: DecideKycRequest,
      options?: MutationOptions,
    ): Promise<Resource<KycCase>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.admin.decideKyc(id),
        body,
        schema: kycResource,
      }),

    /** Sanctions, PEP and adverse-media hits awaiting adjudication. */
    screeningHits: (
      query?: CursorQuery,
      options?: QueryOptions,
    ): Promise<Paginated<ScreeningHit>> =>
      http.get({ ...options, path: routes.admin.screeningHits, query, schema: screeningList }),

    /** Records a decision on a screening hit. */
    decideScreeningHit: (
      body: { readonly hitId: string; readonly status: string; readonly note: string },
      options?: MutationOptions,
    ): Promise<Acknowledged> =>
      http.patch({
        ...options,
        path: routes.admin.screeningHits,
        body,
        schema: acknowledgedSchema,
      }),
  };
}

/** The customer-facing half of `client.admin`. */
export type AdminCustomersResource = ReturnType<typeof createAdminCustomersResource>;
