/**
 * Stored record → the frozen contract shapes.
 *
 * The payload is `Record<string, unknown>` because one collection serves eight kinds. All
 * the narrowing happens here, in one file, so a reader can see exactly which payload keys
 * each kind is expected to carry — and so a missing key produces a sensible empty value
 * rather than `undefined` reaching a marketing page.
 */

import {
  type Article,
  type CmsPage,
  type ContentBlock,
  type Faq,
  type Seo,
} from '@reliance/contracts';

import { type ContentRecord } from './content.store.js';

const EMPTY_SEO: Seo = Object.freeze({
  title: '',
  description: '',
  ogImageUrl: null,
  canonicalUrl: null,
  noIndex: false,
});

/** Average adult reading speed, words per minute. Used when a post declares no estimate. */
const WORDS_PER_MINUTE = 220;

function readString(payload: Record<string, unknown>, key: string, fallback = ''): string {
  const value = payload[key];
  return typeof value === 'string' ? value : fallback;
}

function readNumber(payload: Record<string, unknown>, key: string, fallback: number): number {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readUrl(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function toCmsPage(record: ContentRecord): CmsPage {
  const blocks = record.payload.blocks;

  return {
    id: record.id,
    slug: record.slug,
    title: record.title,
    status: record.status,
    seo: record.seo ?? { ...EMPTY_SEO, title: record.title },
    blocks: Array.isArray(blocks) ? (blocks as ContentBlock[]) : [],
    publishedAt: record.publishedAt?.toISOString() ?? null,
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toArticle(record: ContentRecord): Article {
  const body = readString(record.payload, 'body');

  return {
    id: record.id,
    slug: record.slug,
    title: record.title,
    excerpt: readString(record.payload, 'excerpt'),
    body,
    coverImageUrl: readUrl(record.payload, 'coverImageUrl'),
    category: readString(record.payload, 'category', 'Insights'),
    tags: [...record.tags],
    authorName: readString(record.payload, 'authorName', 'Reliance Bank'),
    authorAvatarUrl: readUrl(record.payload, 'authorAvatarUrl'),
    readingMinutes: readNumber(record.payload, 'readingMinutes', estimateReadingMinutes(body)),
    status: record.status,
    publishedAt: record.publishedAt?.toISOString() ?? null,
  };
}

export function toFaq(record: ContentRecord): Faq {
  return {
    id: record.id,
    question: record.title,
    answer: readString(record.payload, 'answer'),
    category: readString(record.payload, 'category', 'General'),
    order: record.order,
    helpfulCount: readNumber(record.payload, 'helpfulCount', 0),
  };
}

/** At least one minute — "0 min read" is worse than a rough estimate. */
function estimateReadingMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}
