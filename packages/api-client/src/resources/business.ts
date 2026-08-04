/**
 * Business banking: team members, internal approvals, invoices and payroll.
 *
 * Every shape here comes from `provisional/business.ts` — the frozen contract declares
 * these routes but has no module describing them. See `docs/CONTRACT_CHANGES.md`.
 */

import {
  acknowledgedSchema,
  paginated,
  resource,
  routes,
  type Acknowledged,
  type CursorQuery,
  type Paginated,
  type Resource,
} from '@reliance/contracts';

import { withIdempotencyKey } from '../core/idempotency.js';
import type { HttpTransport } from '../core/transport.js';
import type { MutationOptions, QueryOptions } from '../core/types.js';
import {
  businessApprovalSchema,
  businessMemberSchema,
  invoiceSchema,
  payrollRunSchema,
  type BusinessApproval,
  type BusinessMember,
  type BusinessRole,
  type CreateInvoiceRequest,
  type CreatePayrollRunRequest,
  type DecideBusinessApprovalRequest,
  type Invoice,
  type InviteBusinessMemberRequest,
  type PayrollRun,
} from '../provisional/business.js';

const memberList = paginated(businessMemberSchema);
const memberResource = resource(businessMemberSchema);
const approvalList = paginated(businessApprovalSchema);
const approvalResource = resource(businessApprovalSchema);
const invoiceList = paginated(invoiceSchema);
const invoiceResource = resource(invoiceSchema);
const payrollList = paginated(payrollRunSchema);
const payrollResource = resource(payrollRunSchema);

/** Body of a member role or access change. */
export interface UpdateBusinessMemberRequest {
  readonly role?: BusinessRole;
  readonly accountIds?: readonly string[];
  readonly status?: 'ACTIVE' | 'SUSPENDED';
}

/** Filters for the invoice list. */
export type ListInvoicesQuery = {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly status?: string | undefined;
  readonly search?: string | undefined;
};

/** Builds the `client.business` group. */
export function createBusinessResource(http: HttpTransport) {
  return {
    /** People on the business account. */
    listMembers: (
      query?: CursorQuery,
      options?: QueryOptions,
    ): Promise<Paginated<BusinessMember>> =>
      http.get({ ...options, path: routes.business.members, query, schema: memberList }),

    /** Invites someone to the business account. */
    inviteMember: (
      body: InviteBusinessMemberRequest,
      options?: MutationOptions,
    ): Promise<Resource<BusinessMember>> =>
      http.post({ ...options, path: routes.business.members, body, schema: memberResource }),

    /** One member. */
    getMember: (id: string, options?: QueryOptions): Promise<Resource<BusinessMember>> =>
      http.get({ ...options, path: routes.business.member(id), schema: memberResource }),

    /** Changes a member's role, account access or status. */
    updateMember: (
      id: string,
      body: UpdateBusinessMemberRequest,
      options?: MutationOptions,
    ): Promise<Resource<BusinessMember>> =>
      http.patch({ ...options, path: routes.business.member(id), body, schema: memberResource }),

    /** Removes a member. Their pending approvals are reassigned, not dropped. */
    removeMember: (id: string, options?: MutationOptions): Promise<Acknowledged> =>
      http.delete({ ...options, path: routes.business.member(id), schema: acknowledgedSchema }),

    /** Payments and changes waiting on a colleague's decision. */
    listApprovals: (
      query?: CursorQuery,
      options?: QueryOptions,
    ): Promise<Paginated<BusinessApproval>> =>
      http.get({ ...options, path: routes.business.approvals, query, schema: approvalList }),

    /**
     * Approves or rejects an item.
     *
     * The API refuses a decision from the member who raised it — a second pair of eyes
     * that belongs to the same pair of eyes is not a control.
     */
    decideApproval: (
      id: string,
      body: DecideBusinessApprovalRequest,
      options?: MutationOptions,
    ): Promise<Resource<BusinessApproval>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.business.decideApproval(id),
        body,
        schema: approvalResource,
      }),

    /** Invoices the business has raised. */
    listInvoices: (
      query?: ListInvoicesQuery,
      options?: QueryOptions,
    ): Promise<Paginated<Invoice>> =>
      http.get({ ...options, path: routes.business.invoices, query, schema: invoiceList }),

    /** Raises an invoice, returning the hosted pay link to share. */
    createInvoice: (
      body: CreateInvoiceRequest,
      options?: MutationOptions,
    ): Promise<Resource<Invoice>> =>
      http.post({ ...options, path: routes.business.invoices, body, schema: invoiceResource }),

    /** One invoice. */
    getInvoice: (id: string, options?: QueryOptions): Promise<Resource<Invoice>> =>
      http.get({ ...options, path: routes.business.invoice(id), schema: invoiceResource }),

    /** Voids an invoice. Paid invoices cannot be voided, only credited. */
    voidInvoice: (id: string, options?: MutationOptions): Promise<Resource<Invoice>> =>
      http.delete({ ...options, path: routes.business.invoice(id), schema: invoiceResource }),

    /** Payroll runs. */
    listPayrollRuns: (
      query?: CursorQuery,
      options?: QueryOptions,
    ): Promise<Paginated<PayrollRun>> =>
      http.get({ ...options, path: routes.business.payroll, query, schema: payrollList }),

    /** Submits a payroll run. Enters approval before a single employee is paid. */
    createPayrollRun: (
      body: CreatePayrollRunRequest,
      options?: MutationOptions,
    ): Promise<Resource<PayrollRun>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.business.payroll,
        body,
        schema: payrollResource,
      }),
  };
}

/** The `client.business` group. */
export type BusinessResource = ReturnType<typeof createBusinessResource>;
