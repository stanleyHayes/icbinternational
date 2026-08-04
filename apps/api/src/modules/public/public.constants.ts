/**
 * The public surface's operating parameters.
 *
 * One rule governs this whole module and it is worth stating where it will be read:
 * **no route under `/public` may reach customer data.** Not behind a flag, not with a
 * token, not for an administrator. The surface is unauthenticated, cached by
 * intermediaries we do not control, and served to anyone who asks — so the way to keep
 * customer data out of it is to give it no path to any.
 *
 * `__tests__/public-boundary.test.ts` asserts that boundary against the actual controller
 * metadata rather than against a promise made in a comment.
 */

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const CONTENT_CACHE_MINUTES = 5;
const SUBMISSION_WINDOW_MINUTES = 10;

/** How long a CDN may serve a page or post without revalidating. */
export const CONTENT_MAX_AGE_SECONDS = CONTENT_CACHE_MINUTES * SECONDS_PER_MINUTE;

/** How long a stale copy may be served while a fresh one is fetched behind it. */
export const CONTENT_STALE_SECONDS = MINUTES_PER_HOUR * SECONDS_PER_MINUTE;

/** Rates change rarely and matter when they do. Short cache, long stale window. */
export const RATES_MAX_AGE_SECONDS = SECONDS_PER_MINUTE;

/** The directory is reference data. Cache it hard. */
export const DIRECTORY_MAX_AGE_SECONDS = MINUTES_PER_HOUR * SECONDS_PER_MINUTE;

/** A calculator's answer depends only on its inputs, so it can be cached indefinitely. */
export const CALCULATOR_MAX_AGE_SECONDS = HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE;

/** Requests one address may make to the public surface per window. */
export const PUBLIC_RATE_LIMIT = 120;

/** The rate-limit window, in seconds. */
export const PUBLIC_RATE_WINDOW_SECONDS = SECONDS_PER_MINUTE;

/**
 * A much tighter limit for the two routes that write.
 *
 * Lead capture and newsletter sign-up create records from unauthenticated input, which
 * makes them the only interesting targets here. Everything else is a read.
 */
export const SUBMISSION_RATE_LIMIT = 5;
export const SUBMISSION_RATE_WINDOW_SECONDS = SUBMISSION_WINDOW_MINUTES * SECONDS_PER_MINUTE;

/** Articles returned by the blog listing. */
export const POST_PAGE_SIZE = 24;

/** FAQs returned in one response. The whole help centre is smaller than this. */
export const FAQ_LIMIT = 200;

export const LEAD_COLLECTION = 'public_leads';
export const LEAD_MODEL = 'PublicLead';
