import type Link from 'next/link';
import type { ComponentProps } from 'react';

/**
 * An href this site is allowed to link to.
 *
 * Derived from `next/link` rather than declared as `string`, so with typed routes on the
 * union narrows to the routes that actually exist. A link to a page nobody built then
 * fails the build instead of becoming a 404 a customer finds first.
 */
export type SiteHref = Extract<ComponentProps<typeof Link>['href'], string>;

/** Builds the href for an insights article. */
export function insightHref(slug: string) {
  return `/insights/${slug}` as const;
}

/** Builds the href for a legal document. */
export function legalHref(document: string) {
  return `/legal/${document}` as const;
}
