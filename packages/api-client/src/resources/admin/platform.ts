/**
 * Admin: products, CMS, comms, tickets, staff, audit, flags and jobs.
 *
 * `verifyAuditChain` is the only method here worth pausing on. The audit log is a hash
 * chain, so an edited event breaks every link after it — this endpoint walks the chain
 * and names the first broken sequence number, which is the difference between "we think
 * the log is intact" and knowing it.
 */

import type { z } from 'zod';

import {
  adminUserSchema,
  articleSchema,
  auditEventSchema,
  cmsPageSchema,
  faqSchema,
  featureFlagSchema,
  locationSchema,
  paginated,
  productSchema,
  resource,
  routes,
  ticketSchema,
  auditChainVerificationSchema,
  type AdminUser,
  type Article,
  type AuditEvent,
  type BankLocation,
  type CmsPage,
  type CursorQuery,
  type Faq,
  type FeatureFlag,
  type Paginated,
  type Product,
  type Resource,
  type Ticket,
} from '@reliance/contracts';

import type { HttpTransport } from '../../core/transport.js';
import type { MutationOptions, QueryOptions } from '../../core/types.js';
import {
  adminRoleDefinitionSchema,
  commsCampaignSchema,
  commsTemplateSchema,
  jobRunSchema,
  type AdminRoleDefinition,
  type CommsCampaign,
  type CommsTemplate,
  type JobRun,
} from '../../provisional/operations.js';

const productList = paginated(productSchema);
const productResource = resource(productSchema);
const pageList = paginated(cmsPageSchema);
const pageResource = resource(cmsPageSchema);
const articleList = paginated(articleSchema);
const faqList = paginated(faqSchema);
const locationList = paginated(locationSchema);
const templateList = paginated(commsTemplateSchema);
const campaignList = paginated(commsCampaignSchema);
const campaignResource = resource(commsCampaignSchema);
const ticketList = paginated(ticketSchema);
const ticketResource = resource(ticketSchema);
const adminList = paginated(adminUserSchema);
const adminResource = resource(adminUserSchema);
const roleList = paginated(adminRoleDefinitionSchema);
const auditList = paginated(auditEventSchema);
const flagList = paginated(featureFlagSchema);
const flagResource = resource(featureFlagSchema);
const jobList = paginated(jobRunSchema);
const jobResource = resource(jobRunSchema);

type AuditVerification = z.infer<typeof auditChainVerificationSchema>;

/** Filters for the audit trail. */
export type AuditQuery = {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly actorId?: string | undefined;
  readonly entity?: string | undefined;
  readonly entityId?: string | undefined;
  readonly action?: string | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
};

/** Builds the platform half of `client.admin`. */
export function createAdminPlatformResource(http: HttpTransport) {
  return {
    /** The product catalogue, including inactive and superseded versions. */
    products: (query?: CursorQuery, options?: QueryOptions): Promise<Paginated<Product>> =>
      http.get({ ...options, path: routes.admin.products, query, schema: productList }),

    /** Creates a product version. Repricing never edits a live product in place. */
    createProduct: (
      body: Partial<Product>,
      options?: MutationOptions,
    ): Promise<Resource<Product>> =>
      http.post({ ...options, path: routes.admin.products, body, schema: productResource }),

    /** One product by code. */
    product: (code: string, options?: QueryOptions): Promise<Resource<Product>> =>
      http.get({ ...options, path: routes.admin.product(code), schema: productResource }),

    /** Supersedes a product with a new effective-dated version. */
    updateProduct: (
      code: string,
      body: Partial<Product>,
      options?: MutationOptions,
    ): Promise<Resource<Product>> =>
      http.put({ ...options, path: routes.admin.product(code), body, schema: productResource }),

    /** CMS pages in every publish state. */
    cmsPages: (query?: CursorQuery, options?: QueryOptions): Promise<Paginated<CmsPage>> =>
      http.get({ ...options, path: routes.admin.cmsPages, query, schema: pageList }),

    /** Creates a page. */
    createCmsPage: (
      body: Partial<CmsPage>,
      options?: MutationOptions,
    ): Promise<Resource<CmsPage>> =>
      http.post({ ...options, path: routes.admin.cmsPages, body, schema: pageResource }),

    /** One page, with its ordered blocks. */
    cmsPage: (id: string, options?: QueryOptions): Promise<Resource<CmsPage>> =>
      http.get({ ...options, path: routes.admin.cmsPage(id), schema: pageResource }),

    /** Edits a page. */
    updateCmsPage: (
      id: string,
      body: Partial<CmsPage>,
      options?: MutationOptions,
    ): Promise<Resource<CmsPage>> =>
      http.put({ ...options, path: routes.admin.cmsPage(id), body, schema: pageResource }),

    /** Articles in every publish state. */
    cmsPosts: (query?: CursorQuery, options?: QueryOptions): Promise<Paginated<Article>> =>
      http.get({ ...options, path: routes.admin.cmsPosts, query, schema: articleList }),

    /** FAQs. */
    cmsFaqs: (query?: CursorQuery, options?: QueryOptions): Promise<Paginated<Faq>> =>
      http.get({ ...options, path: routes.admin.cmsFaqs, query, schema: faqList }),

    /** Branches and ATMs. */
    cmsLocations: (query?: CursorQuery, options?: QueryOptions): Promise<Paginated<BankLocation>> =>
      http.get({ ...options, path: routes.admin.cmsLocations, query, schema: locationList }),

    /** Publishes any CMS entity — page, post, FAQ or location. */
    publish: (
      id: string,
      body: { readonly publishAt?: string },
      options?: MutationOptions,
    ): Promise<Resource<CmsPage>> =>
      http.post({ ...options, path: routes.admin.publish(id), body, schema: pageResource }),

    /** Messaging templates. */
    templates: (query?: CursorQuery, options?: QueryOptions): Promise<Paginated<CommsTemplate>> =>
      http.get({ ...options, path: routes.admin.templates, query, schema: templateList }),

    /** Campaign sends. */
    campaigns: (query?: CursorQuery, options?: QueryOptions): Promise<Paginated<CommsCampaign>> =>
      http.get({ ...options, path: routes.admin.campaigns, query, schema: campaignList }),

    /** Schedules a campaign. */
    createCampaign: (
      body: Partial<CommsCampaign>,
      options?: MutationOptions,
    ): Promise<Resource<CommsCampaign>> =>
      http.post({ ...options, path: routes.admin.campaigns, body, schema: campaignResource }),

    /** The support ticket queue. */
    tickets: (query?: CursorQuery, options?: QueryOptions): Promise<Paginated<Ticket>> =>
      http.get({ ...options, path: routes.admin.tickets, query, schema: ticketList }),

    /** One ticket, from the agent's side. */
    ticket: (id: string, options?: QueryOptions): Promise<Resource<Ticket>> =>
      http.get({ ...options, path: routes.admin.ticket(id), schema: ticketResource }),

    /** Replies, reassigns, escalates or resolves. */
    updateTicket: (
      id: string,
      body: Partial<Ticket> & { readonly reply?: string },
      options?: MutationOptions,
    ): Promise<Resource<Ticket>> =>
      http.patch({ ...options, path: routes.admin.ticket(id), body, schema: ticketResource }),

    /** Staff accounts. */
    users: (query?: CursorQuery, options?: QueryOptions): Promise<Paginated<AdminUser>> =>
      http.get({ ...options, path: routes.admin.users, query, schema: adminList }),

    /** Creates a staff account. */
    createUser: (
      body: Partial<AdminUser>,
      options?: MutationOptions,
    ): Promise<Resource<AdminUser>> =>
      http.post({ ...options, path: routes.admin.users, body, schema: adminResource }),

    /** One staff account. */
    user: (id: string, options?: QueryOptions): Promise<Resource<AdminUser>> =>
      http.get({ ...options, path: routes.admin.user(id), schema: adminResource }),

    /** Changes a staff member's roles or deactivates them. */
    updateUser: (
      id: string,
      body: Partial<AdminUser>,
      options?: MutationOptions,
    ): Promise<Resource<AdminUser>> =>
      http.patch({ ...options, path: routes.admin.user(id), body, schema: adminResource }),

    /** Role definitions and the permissions each bundles. */
    roles: (query?: CursorQuery, options?: QueryOptions): Promise<Paginated<AdminRoleDefinition>> =>
      http.get({ ...options, path: routes.admin.roles, query, schema: roleList }),

    /** The audit trail. Append-only, hash-chained, never edited. */
    audit: (query?: AuditQuery, options?: QueryOptions): Promise<Paginated<AuditEvent>> =>
      http.get({ ...options, path: routes.admin.audit, query, schema: auditList }),

    /** Walks the hash chain and names the first broken link, if there is one. */
    verifyAuditChain: (options?: MutationOptions): Promise<AuditVerification> =>
      http.post({
        ...options,
        path: routes.admin.verifyAuditChain,
        schema: auditChainVerificationSchema,
      }),

    /** Feature flags and their rollout percentages. */
    flags: (query?: CursorQuery, options?: QueryOptions): Promise<Paginated<FeatureFlag>> =>
      http.get({ ...options, path: routes.admin.flags, query, schema: flagList }),

    /** Toggles a flag or moves its rollout. */
    setFlag: (
      key: string,
      body: Partial<FeatureFlag>,
      options?: MutationOptions,
    ): Promise<Resource<FeatureFlag>> =>
      http.put({ ...options, path: routes.admin.flag(key), body, schema: flagResource }),

    /** Background job runs, including the dead-letter queue. */
    jobs: (query?: CursorQuery, options?: QueryOptions): Promise<Paginated<JobRun>> =>
      http.get({ ...options, path: routes.admin.jobs, query, schema: jobList }),

    /** Replays a failed job. */
    replayJob: (id: string, options?: MutationOptions): Promise<Resource<JobRun>> =>
      http.post({ ...options, path: routes.admin.replayJob(id), schema: jobResource }),
  };
}

/** The platform half of `client.admin`. */
export type AdminPlatformResource = ReturnType<typeof createAdminPlatformResource>;
