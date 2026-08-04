/**
 * The shape of the content the bank ships with.
 *
 * A bank's rates page, fee schedule and branch directory are not optional furniture — a
 * marketing site with an empty CMS is a bank that cannot tell you what it charges. This
 * catalogue is the content the API installs on first boot, so a fresh database produces a
 * working, honest site rather than a set of empty states.
 *
 * It is product content and is held to §4.6 exactly as the templates are. Real rates, real
 * terms, real branch addresses.
 */

import { type Seo } from '@reliance/contracts';

import { type ContentKind } from '../cms.constants.js';

export interface CatalogueEntry {
  readonly kind: ContentKind;
  readonly slug: string;
  readonly title: string;
  readonly seo?: Seo;
  readonly payload: Record<string, unknown>;
  readonly tags?: readonly string[];
  readonly order?: number;
  /** Integer microdegrees — the form coordinates are stored in. Locations only. */
  readonly latitudeMicro?: number;
  readonly longitudeMicro?: number;
}

/** Builds an SEO block without repeating the same four nulls at every call site. */
export function seo(title: string, description: string): Seo {
  return { title, description, ogImageUrl: null, canonicalUrl: null, noIndex: false };
}
