/**
 * Bill payments, top-ups, peer payment requests and direct-debit mandates.
 *
 * All four live in one group because the contract's `routes.payments` groups them, and
 * because they share a property worth stating once: every one of them can be rejected by
 * a third party *after* the debit has posted. The reversal is the API's job, so callers
 * poll the returned resource rather than assuming success from a 201.
 */

import {
  billerSchema,
  billPaymentSchema,
  mandateSchema,
  paginated,
  paymentRequestSchema,
  resource,
  routes,
  type BillPayment,
  type Biller,
  type BillerCategory,
  type CreateBillPaymentRequest,
  type CreatePaymentRequestRequest,
  type CreateTopUpRequest,
  type CursorQuery,
  type Mandate,
  type MandateStatus,
  type Paginated,
  type PaymentRequest,
  type Resource,
  type SplitBillRequest,
} from '@reliance/contracts';

import { withIdempotencyKey } from '../core/idempotency.js';
import type { HttpTransport } from '../core/transport.js';
import type { MutationOptions, QueryOptions } from '../core/types.js';

const billerList = paginated(billerSchema);
const billerResource = resource(billerSchema);
const billPaymentList = paginated(billPaymentSchema);
const billPaymentResource = resource(billPaymentSchema);
const paymentRequestList = paginated(paymentRequestSchema);
const paymentRequestResource = resource(paymentRequestSchema);
const mandateList = paginated(mandateSchema);
const mandateResource = resource(mandateSchema);

/** Filters for the biller directory. */
export type ListBillersQuery = {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly category?: BillerCategory | undefined;
  readonly search?: string | undefined;
};

/** Filters for the mandate list. */
export type ListMandatesQuery = {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly status?: MandateStatus | undefined;
  readonly accountId?: string | undefined;
};

/** Body of a mandate change. */
export interface UpdateMandateRequest {
  readonly status: 'ACTIVE' | 'PAUSED' | 'CANCELLED';
  readonly reason?: string;
}

/** Body of paying someone else's request. */
export interface PayPaymentRequestBody {
  readonly sourceAccountId: string;
}

/** Builds the `client.payments` group. */
export function createPaymentsResource(http: HttpTransport) {
  return {
    /** The biller directory. */
    listBillers: (query?: ListBillersQuery, options?: QueryOptions): Promise<Paginated<Biller>> =>
      http.get({ ...options, path: routes.payments.billers, query, schema: billerList }),

    /** One biller, including the pattern its customer reference must match. */
    getBiller: (id: string, options?: QueryOptions): Promise<Resource<Biller>> =>
      http.get({ ...options, path: routes.payments.biller(id), schema: billerResource }),

    /** Bill payments the customer has made. */
    listBillPayments: (
      query?: CursorQuery,
      options?: QueryOptions,
    ): Promise<Paginated<BillPayment>> =>
      http.get({
        ...options,
        path: routes.payments.billPayments,
        query,
        schema: billPaymentList,
      }),

    /** Pays a bill. Refunded automatically if the biller rejects after the debit. */
    payBill: (
      body: CreateBillPaymentRequest,
      options?: MutationOptions,
    ): Promise<Resource<BillPayment>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.payments.billPayments,
        body,
        schema: billPaymentResource,
      }),

    /** One bill payment, with the biller's receipt token once it settles. */
    getBillPayment: (id: string, options?: QueryOptions): Promise<Resource<BillPayment>> =>
      http.get({
        ...options,
        path: routes.payments.billPayment(id),
        schema: billPaymentResource,
      }),

    /** Buys airtime or a data bundle. */
    topUp: (body: CreateTopUpRequest, options?: MutationOptions): Promise<Resource<BillPayment>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.payments.topUps,
        body,
        schema: billPaymentResource,
      }),

    /** Payment requests the customer has raised. */
    listRequests: (
      query?: CursorQuery,
      options?: QueryOptions,
    ): Promise<Paginated<PaymentRequest>> =>
      http.get({
        ...options,
        path: routes.payments.requests,
        query,
        schema: paymentRequestList,
      }),

    /** Asks someone for money. Returns a shareable link and a QR payload. */
    createRequest: (
      body: CreatePaymentRequestRequest,
      options?: MutationOptions,
    ): Promise<Resource<PaymentRequest>> =>
      http.post({
        ...options,
        path: routes.payments.requests,
        body,
        schema: paymentRequestResource,
      }),

    /** One payment request. */
    getRequest: (id: string, options?: QueryOptions): Promise<Resource<PaymentRequest>> =>
      http.get({
        ...options,
        path: routes.payments.request(id),
        schema: paymentRequestResource,
      }),

    /** Cancels a request the customer raised. */
    cancelRequest: (id: string, options?: MutationOptions): Promise<Resource<PaymentRequest>> =>
      http.delete({
        ...options,
        path: routes.payments.request(id),
        schema: paymentRequestResource,
      }),

    /** Settles someone else's request from one of your accounts. */
    payRequest: (
      id: string,
      body: PayPaymentRequestBody,
      options?: MutationOptions,
    ): Promise<Resource<PaymentRequest>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.payments.payRequest(id),
        body,
        schema: paymentRequestResource,
      }),

    /** Splits a bill into one request per participant, shares weighted. */
    splitBill: (
      body: SplitBillRequest,
      options?: MutationOptions,
    ): Promise<Paginated<PaymentRequest>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.payments.splitBill,
        body,
        schema: paymentRequestList,
      }),

    /** Direct debits the customer has authorised. */
    listMandates: (
      query?: ListMandatesQuery,
      options?: QueryOptions,
    ): Promise<Paginated<Mandate>> =>
      http.get({ ...options, path: routes.payments.mandates, query, schema: mandateList }),

    /** One mandate, including what was last collected under it. */
    getMandate: (id: string, options?: QueryOptions): Promise<Resource<Mandate>> =>
      http.get({ ...options, path: routes.payments.mandate(id), schema: mandateResource }),

    /** Pauses or cancels a mandate. Cancellation is final; the merchant must re-ask. */
    updateMandate: (
      id: string,
      body: UpdateMandateRequest,
      options?: MutationOptions,
    ): Promise<Resource<Mandate>> =>
      http.patch({
        ...options,
        path: routes.payments.mandate(id),
        body,
        schema: mandateResource,
      }),
  };
}

/** The `client.payments` group. */
export type PaymentsResource = ReturnType<typeof createPaymentsResource>;
