/**
 * Wire shapes for the staff content endpoints.
 *
 * The frozen contract describes what the *public* reads — a `CmsPage`, an `Article`, a
 * `Faq`. It says nothing about editing, because nothing outside the admin console does
 * any. Those shapes are declared here from contract primitives.
 */

import { z } from 'zod';

import { isoDateTimeSchema, PublishStatus, seoSchema, shortTextSchema } from '@reliance/contracts';

import { CONTENT_PAGE_SIZE, ContentKind } from './cms.constants.js';
import { MAX_LATITUDE_MICRO, MAX_LONGITUDE_MICRO } from './locations/geo.js';
import { ContentAction } from './publishing/workflow.js';

/** Longest slug the router will route and the console will show without truncating. */
const MAX_SLUG_LENGTH = 120;
/** BCP 47 tags run from `en` to `zh-Hant-HK`. */
const MIN_LOCALE_LENGTH = 2;
const MAX_LOCALE_LENGTH = 10;
/** Longest title search a staff listing accepts. */
const MAX_SEARCH_LENGTH = 80;
const MAX_LISTING_LIMIT = 100;

const latitudeMicroSchema = z.number().int().min(-MAX_LATITUDE_MICRO).max(MAX_LATITUDE_MICRO);
const longitudeMicroSchema = z.number().int().min(-MAX_LONGITUDE_MICRO).max(MAX_LONGITUDE_MICRO);

/** A slug is lower-case, hyphenated, and may nest one level for a page. */
const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_SLUG_LENGTH)
  .regex(/^[a-z0-9]+(?:[/-][a-z0-9]+)*$/, 'use lower-case words separated by hyphens');

export const createContentRequestSchema = z.object({
  kind: z.enum(ContentKind),
  slug: slugSchema,
  title: shortTextSchema,
  locale: z.string().min(MIN_LOCALE_LENGTH).max(MAX_LOCALE_LENGTH).default('en-GB'),
  seo: seoSchema.nullable().default(null),
  payload: z.record(z.string(), z.unknown()).default({}),
  tags: z.array(shortTextSchema).default([]),
  order: z.number().int().min(0).default(0),
  latitudeMicro: latitudeMicroSchema.nullable().default(null),
  longitudeMicro: longitudeMicroSchema.nullable().default(null),
});
export type CreateContentRequest = z.infer<typeof createContentRequestSchema>;

export const updateContentRequestSchema = z.object({
  title: shortTextSchema.optional(),
  seo: seoSchema.nullable().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(shortTextSchema).optional(),
  order: z.number().int().min(0).optional(),
  latitudeMicro: latitudeMicroSchema.nullable().optional(),
  longitudeMicro: longitudeMicroSchema.nullable().optional(),
  /** Recorded against the revision this edit supersedes. */
  note: shortTextSchema.optional(),
});
export type UpdateContentRequest = z.infer<typeof updateContentRequestSchema>;

export const contentActionRequestSchema = z.object({
  action: z.enum(ContentAction),
  /** Required when the action is `SCHEDULE`. */
  scheduledFor: isoDateTimeSchema.optional(),
});
export type ContentActionRequest = z.infer<typeof contentActionRequestSchema>;

export const rollbackRequestSchema = z.object({ revision: z.number().int().positive() });
export type RollbackRequest = z.infer<typeof rollbackRequestSchema>;

export const listContentQuerySchema = z.object({
  kind: z.enum(ContentKind).optional(),
  status: z.enum(PublishStatus).optional(),
  locale: z.string().optional(),
  tag: z.string().optional(),
  search: z.string().trim().max(MAX_SEARCH_LENGTH).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LISTING_LIMIT).default(CONTENT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListContentQuery = z.infer<typeof listContentQuerySchema>;

/** How a content document looks to a member of staff — payload and workflow included. */
export const contentSummarySchema = z.object({
  id: z.string(),
  kind: z.enum(ContentKind),
  slug: z.string(),
  title: shortTextSchema,
  status: z.enum(PublishStatus),
  locale: z.string(),
  tags: z.array(shortTextSchema),
  order: z.number().int(),
  revision: z.number().int(),
  scheduledFor: isoDateTimeSchema.nullable(),
  publishedAt: isoDateTimeSchema.nullable(),
  updatedAt: isoDateTimeSchema,
  updatedBy: z.string().nullable(),
  availableActions: z.array(z.enum(ContentAction)),
});
export type ContentSummary = z.infer<typeof contentSummarySchema>;

export const contentDetailSchema = contentSummarySchema.extend({
  seo: seoSchema.nullable(),
  payload: z.record(z.string(), z.unknown()),
  latitudeMicro: z.number().int().nullable(),
  longitudeMicro: z.number().int().nullable(),
});
export type ContentDetail = z.infer<typeof contentDetailSchema>;

export const revisionSummarySchema = z.object({
  revision: z.number().int(),
  title: shortTextSchema,
  status: z.enum(PublishStatus),
  savedBy: z.string().nullable(),
  savedAt: isoDateTimeSchema,
  note: z.string().nullable(),
});
export type RevisionSummary = z.infer<typeof revisionSummarySchema>;

export const previewLinkSchema = z.object({
  documentId: z.string(),
  token: z.string(),
  /** How long the link works for, in seconds. */
  expiresInSeconds: z.number().int().positive(),
});
export type PreviewLink = z.infer<typeof previewLinkSchema>;
