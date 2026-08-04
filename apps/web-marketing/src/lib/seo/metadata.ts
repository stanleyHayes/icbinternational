/**
 * Page metadata, built the same way every time.
 *
 * Titles, descriptions, canonicals and Open Graph tags are the parts of a page a customer
 * sees before they ever load it — in a search result, in a shared link, in a bookmark. A
 * helper rather than hand-written objects means none of them can be forgotten on page 22.
 */

import type { Metadata } from 'next';

import { BANK, SITE_URL } from '@/content/site';

/** What a page needs to supply. Everything else is derived. */
export interface PageMetaInput {
  readonly title: string;
  readonly description: string;
  /** Path with a leading slash, e.g. `/savings`. */
  readonly path: string;
  /** Keeps a thin or duplicative page out of the index without hiding it from customers. */
  readonly noIndex?: boolean;
  /** Set for editorial pages so shares render as articles rather than a company page. */
  readonly article?: {
    readonly publishedTime: string;
    readonly authors: readonly string[];
    readonly section: string;
    readonly tags: readonly string[];
  };
  /** Search terms that help this page rank for the right phrases. */
  readonly keywords?: readonly string[];
  /** Optional share images, resolved against the site origin. */
  readonly images?: readonly string[];
}

/** Absolute URL for a site-relative path. */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}

/** Builds a page's `Metadata`, with canonical and Open Graph filled in. */
export function pageMetadata(input: PageMetaInput): Metadata {
  const url = absoluteUrl(input.path);
  const images = input.images?.map((image) => absoluteUrl(image));

  return {
    title: input.title,
    description: input.description,
    keywords: input.keywords?.length ? [...input.keywords] : undefined,
    alternates: { canonical: url },
    ...(input.noIndex === true ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      type: input.article ? 'article' : 'website',
      url,
      siteName: BANK.shortName,
      title: input.title,
      description: input.description,
      locale: 'en_GB',
      ...(images ? { images } : {}),
      ...(input.article
        ? {
            publishedTime: input.article.publishedTime,
            authors: [...input.article.authors],
            section: input.article.section,
            tags: [...input.article.tags],
          }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: input.title,
      description: input.description,
      ...(images ? { images: images[0] } : {}),
    },
  };
}
