/**
 * Admin handlers: tickets, jobs, flags, comms, products and CMS.
 */

import { routes } from '@reliance/contracts';

import { opaqueId } from '../faker.js';

import { MockMethod, notFound, resourceCreated, resourceOk, route, type MockRoute } from './kit.js';
import { paginate } from './paging.js';

/** The platform half of the admin console. */
export const adminPlatformHandlers: readonly MockRoute[] = [
  route(MockMethod.GET, routes.admin.tickets, ({ db, query }) => {
    const status = query.get('status');
    return paginate(
      db.tickets.filter((ticket) => !status || ticket.status === status),
      query,
      { includeTotal: true },
    );
  }),

  route(MockMethod.GET, routes.admin.ticket(':id'), ({ db, params }) => {
    const ticket = db.tickets.find((candidate) => candidate.id === params.id);
    return ticket ? resourceOk(ticket) : notFound('That ticket');
  }),

  route(MockMethod.PATCH, routes.admin.ticket(':id'), ({ body, db, params }) => {
    const index = db.tickets.findIndex((candidate) => candidate.id === params.id);
    const ticket = db.tickets[index];
    if (index === -1 || !ticket) return notFound('That ticket');

    const input = (body ?? {}) as Record<string, unknown>;
    const updated = {
      ...ticket,
      ...(input as Partial<typeof ticket>),
      messages:
        typeof input.reply === 'string'
          ? [
              ...ticket.messages,
              {
                id: opaqueId(),
                authorType: 'AGENT' as const,
                authorName: db.adminUsers[0]?.fullName ?? 'An agent',
                body: input.reply,
                attachmentIds: [],
                sentAt: db.clock.nowIso(),
              },
            ]
          : ticket.messages,
      updatedAt: db.clock.nowIso(),
    };
    db.tickets[index] = updated;
    return resourceOk(updated);
  }),

  route(MockMethod.GET, routes.admin.jobs, ({ db, query }) => {
    const status = query.get('status');
    return paginate(
      db.jobRuns.filter((job) => !status || job.status === status),
      query,
      { includeTotal: true },
    );
  }),

  route(MockMethod.POST, routes.admin.replayJob(':id'), ({ db, params }) => {
    const index = db.jobRuns.findIndex((candidate) => candidate.id === params.id);
    const job = db.jobRuns[index];
    if (index === -1 || !job) return notFound('That job run');

    const replayed = {
      ...job,
      status: 'COMPLETED' as const,
      attempts: job.attempts + 1,
      failureReason: null,
      startedAt: db.clock.nowIso(),
      finishedAt: db.clock.nowIso(),
    };
    db.jobRuns[index] = replayed;
    return resourceOk(replayed);
  }),

  route(MockMethod.GET, routes.admin.flags, ({ db, query }) =>
    paginate(
      db.featureFlags.map((flag) => ({ ...flag, id: flag.key })),
      query,
    ),
  ),

  route(MockMethod.PUT, routes.admin.flag(':key'), ({ body, db, params }) => {
    const index = db.featureFlags.findIndex((candidate) => candidate.key === params.key);
    const flag = db.featureFlags[index];
    if (index === -1 || !flag) return notFound('That flag');
    const updated = {
      ...flag,
      ...(body as Partial<typeof flag>),
      key: flag.key,
      updatedAt: db.clock.nowIso(),
    };
    db.featureFlags[index] = updated;
    return resourceOk(updated);
  }),

  route(MockMethod.GET, routes.admin.templates, ({ db, query }) =>
    paginate(db.commsTemplates, query),
  ),

  route(MockMethod.GET, routes.admin.campaigns, ({ db, query }) =>
    paginate(db.commsCampaigns, query),
  ),

  route(MockMethod.POST, routes.admin.campaigns, ({ body, db }) => {
    const template = db.commsCampaigns[0];
    if (!template) return notFound('A campaign template');
    const created = {
      ...template,
      ...(body as Partial<typeof template>),
      id: opaqueId(),
      status: 'SCHEDULED' as const,
      sentCount: 0,
      openCount: 0,
      clickCount: 0,
      sentAt: null,
      createdAt: db.clock.nowIso(),
    };
    db.commsCampaigns.unshift(created);
    return resourceCreated(created);
  }),

  route(MockMethod.GET, routes.admin.products, ({ db, query }) =>
    paginate(
      db.products.map((product) => ({ ...product, id: product.code })),
      query,
      { includeTotal: true },
    ),
  ),

  route(MockMethod.POST, routes.admin.products, ({ body, db }) => {
    const template = db.products[0];
    if (!template) return notFound('A product template');
    const created = { ...template, ...(body as Partial<typeof template>), version: 1 };
    db.products.unshift(created);
    return resourceCreated(created);
  }),

  route(MockMethod.GET, routes.admin.product(':code'), ({ db, params }) => {
    const product = db.products.find((candidate) => candidate.code === params.code);
    return product ? resourceOk(product) : notFound('That product');
  }),

  /**
   * Repricing creates a new version rather than editing the live one, so an account
   * opened last year keeps the terms it was sold.
   */
  route(MockMethod.PUT, routes.admin.product(':code'), ({ body, db, params }) => {
    const index = db.products.findIndex((candidate) => candidate.code === params.code);
    const product = db.products[index];
    if (index === -1 || !product) return notFound('That product');

    const superseded = { ...product, effectiveTo: db.clock.todayIso() };
    const next = {
      ...product,
      ...(body as Partial<typeof product>),
      code: product.code,
      version: product.version + 1,
      effectiveFrom: db.clock.todayIso(),
      effectiveTo: null,
    };
    db.products[index] = superseded;
    db.products.unshift(next);
    return resourceOk(next);
  }),

  route(MockMethod.GET, routes.admin.cmsPages, ({ db, query }) => paginate(db.pages, query)),

  route(MockMethod.POST, routes.admin.cmsPages, ({ body, db }) => {
    const template = db.pages[0];
    if (!template) return notFound('A page template');
    const created = {
      ...template,
      ...(body as Partial<typeof template>),
      id: opaqueId(),
      status: 'DRAFT' as const,
      publishedAt: null,
      updatedAt: db.clock.nowIso(),
    };
    db.pages.unshift(created);
    return resourceCreated(created);
  }),

  route(MockMethod.GET, routes.admin.cmsPosts, ({ db, query }) => paginate(db.articles, query)),
  route(MockMethod.GET, routes.admin.cmsFaqs, ({ db, query }) => paginate(db.faqs, query)),
  route(MockMethod.GET, routes.admin.cmsLocations, ({ db, query }) =>
    paginate(db.locations, query),
  ),

  route(MockMethod.POST, routes.admin.publish(':id'), ({ db, params }) => {
    const index = db.pages.findIndex((candidate) => candidate.id === params.id);
    const page = db.pages[index];
    if (index === -1 || !page) return notFound('That content item');
    const published = {
      ...page,
      status: 'PUBLISHED' as const,
      publishedAt: db.clock.nowIso(),
      updatedAt: db.clock.nowIso(),
    };
    db.pages[index] = published;
    return resourceOk(published);
  }),

  route(MockMethod.GET, routes.admin.cmsPage(':id'), ({ db, params }) => {
    const page = db.pages.find((candidate) => candidate.id === params.id);
    return page ? resourceOk(page) : notFound('That page');
  }),

  route(MockMethod.PUT, routes.admin.cmsPage(':id'), ({ body, db, params }) => {
    const index = db.pages.findIndex((candidate) => candidate.id === params.id);
    const page = db.pages[index];
    if (index === -1 || !page) return notFound('That page');
    const updated = {
      ...page,
      ...(body as Partial<typeof page>),
      id: page.id,
      updatedAt: db.clock.nowIso(),
    };
    db.pages[index] = updated;
    return resourceOk(updated);
  }),
];
