/**
 * The CMS vocabulary: what kinds of content exist, and the timings the workflow runs on.
 *
 * Every kind shares one collection and one publishing workflow. That is the central design
 * decision of this module: draft → review → publish, scheduling, revision history and
 * rollback are hard to get right once and impossible to keep consistent across eight
 * bespoke implementations, so a page, a blog post, an FAQ, a branch and a legal document
 * are all the same shape with a different typed payload.
 */

export const CONTENT_COLLECTION = 'cms_documents';
export const CONTENT_MODEL = 'CmsDocument';

export const REVISION_COLLECTION = 'cms_revisions';
export const REVISION_MODEL = 'CmsRevision';

/** What a content document is. The payload shape is keyed off this. */
export const ContentKind = {
  PAGE: 'PAGE',
  POST: 'POST',
  FAQ: 'FAQ',
  LOCATION: 'LOCATION',
  BANNER: 'BANNER',
  LEGAL: 'LEGAL',
  RATE_TABLE: 'RATE_TABLE',
  FEE_SCHEDULE: 'FEE_SCHEDULE',
} as const;
export type ContentKind = (typeof ContentKind)[keyof typeof ContentKind];

/** Kinds the public API will serve. Everything else is staff-only until it moves here. */
export const PUBLICLY_READABLE_KINDS: readonly ContentKind[] = Object.freeze([
  ContentKind.PAGE,
  ContentKind.POST,
  ContentKind.FAQ,
  ContentKind.LOCATION,
  ContentKind.BANNER,
  ContentKind.LEGAL,
  ContentKind.RATE_TABLE,
  ContentKind.FEE_SCHEDULE,
]);

/** How long a preview token stays valid, in seconds. Long enough to review, short enough to leak safely. */
export const PREVIEW_TOKEN_TTL_SECONDS = 3600;

/** Revisions kept per document. Older ones are pruned as new ones land. */
export const MAX_REVISIONS = 50;

/** How often the scheduler looks for content whose publish time has arrived, in milliseconds. */
export const SCHEDULE_SWEEP_INTERVAL_MS = 60_000;

/** Default page size for a staff content listing. */
export const CONTENT_PAGE_SIZE = 50;

/** Largest proximity search radius the locator will honour, in metres. */
export const MAX_SEARCH_RADIUS_METRES = 200_000;

/** Results a proximity search returns. */
export const NEAREST_LOCATION_COUNT = 10;

/** Coordinates are stored as integer microdegrees — see `locations/geo.ts`. */
export const MICRODEGREES_PER_DEGREE = 1_000_000;
