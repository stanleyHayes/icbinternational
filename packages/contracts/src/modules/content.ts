/**
 * Public content: CMS pages, articles, rates, branches and lead capture.
 *
 * Everything in this module is served unauthenticated and heavily cached. No route here
 * may read customer data — the marketing site runs on a strictly separate surface from
 * the banking API, and this contract is where that boundary is written down.
 */

import { z } from 'zod';

import { cursorQuerySchema } from '../common/envelope.js';
import {
  countryCodeSchema,
  emailSchema,
  isoDateTimeSchema,
  longTextSchema,
  mediumTextSchema,
  phoneSchema,
  shortTextSchema,
} from '../common/primitives.js';

export const PublishStatus = {
  DRAFT: 'DRAFT',
  IN_REVIEW: 'IN_REVIEW',
  SCHEDULED: 'SCHEDULED',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type PublishStatus = (typeof PublishStatus)[keyof typeof PublishStatus];

export const seoSchema = z.object({
  title: shortTextSchema,
  description: mediumTextSchema,
  ogImageUrl: z.url().nullable(),
  canonicalUrl: z.url().nullable(),
  noIndex: z.boolean(),
});
export type Seo = z.infer<typeof seoSchema>;

/** A page is an ordered list of typed blocks the marketing site knows how to render. */
export const contentBlockSchema = z.object({
  id: z.string(),
  type: z.enum([
    'HERO',
    'FEATURE_GRID',
    'PRODUCT_CARDS',
    'STATS',
    'TESTIMONIALS',
    'FAQ',
    'CTA',
    'RICH_TEXT',
    'IMAGE',
    'COMPARISON_TABLE',
    'RATE_TABLE',
    'CALCULATOR',
    'LOGO_WALL',
    'STEPS',
  ]),
  /** Block-specific payload, validated by the renderer for that block type. */
  props: z.record(z.string(), z.unknown()),
});
export type ContentBlock = z.infer<typeof contentBlockSchema>;

export const cmsPageSchema = z.object({
  id: z.string(),
  slug: z.string().regex(/^[a-z0-9]+(?:\/[a-z0-9-]+)*$/),
  title: shortTextSchema,
  status: z.enum(PublishStatus),
  seo: seoSchema,
  blocks: z.array(contentBlockSchema),
  publishedAt: isoDateTimeSchema.nullable(),
  updatedAt: isoDateTimeSchema,
});
export type CmsPage = z.infer<typeof cmsPageSchema>;

export const articleSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: shortTextSchema,
  excerpt: mediumTextSchema,
  body: longTextSchema,
  coverImageUrl: z.url().nullable(),
  category: shortTextSchema,
  tags: z.array(shortTextSchema),
  authorName: shortTextSchema,
  authorAvatarUrl: z.url().nullable(),
  readingMinutes: z.number().int().positive(),
  status: z.enum(PublishStatus),
  publishedAt: isoDateTimeSchema.nullable(),
});
export type Article = z.infer<typeof articleSchema>;

export const faqSchema = z.object({
  id: z.string(),
  question: shortTextSchema,
  answer: longTextSchema,
  category: shortTextSchema,
  order: z.number().int(),
  helpfulCount: z.number().int(),
});
export type Faq = z.infer<typeof faqSchema>;

export const LocationKind = { BRANCH: 'BRANCH', ATM: 'ATM', BOTH: 'BOTH' } as const;
export type LocationKind = (typeof LocationKind)[keyof typeof LocationKind];

export const openingHoursSchema = z.object({
  day: z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']),
  opens: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  closes: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
});

export const locationSchema = z.object({
  id: z.string(),
  kind: z.enum(LocationKind),
  name: shortTextSchema,
  addressLine: shortTextSchema,
  city: shortTextSchema,
  postalCode: shortTextSchema,
  country: countryCodeSchema,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  phone: phoneSchema.nullable(),
  services: z.array(shortTextSchema),
  openingHours: z.array(openingHoursSchema),
  wheelchairAccessible: z.boolean(),
  hasDepositMachine: z.boolean(),
  /** Populated only on proximity searches, in metres. */
  distanceMetres: z.number().int().nullable(),
});
export type BankLocation = z.infer<typeof locationSchema>;

export const locationSearchQuerySchema = cursorQuerySchema.extend({
  kind: z.enum(LocationKind).optional(),
  near: z
    .string()
    .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, 'expected "latitude,longitude"')
    .optional(),
  radiusMetres: z.coerce.number().int().min(100).max(200_000).default(25_000),
  query: z.string().trim().max(80).optional(),
});
export type LocationSearchQuery = z.infer<typeof locationSearchQuerySchema>;

export const leadRequestSchema = z.object({
  name: shortTextSchema,
  email: emailSchema,
  phone: phoneSchema.optional(),
  interest: z.enum(['PERSONAL', 'BUSINESS', 'MORTGAGE', 'INVESTMENT', 'CAREERS', 'PRESS']),
  message: mediumTextSchema.optional(),
  /** Honeypot — a real browser leaves it empty. */
  website: z.string().max(0).optional(),
  consent: z.literal(true),
});
export type LeadRequest = z.infer<typeof leadRequestSchema>;

export const newsletterRequestSchema = z.object({ email: emailSchema, consent: z.literal(true) });
