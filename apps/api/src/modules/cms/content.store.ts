/**
 * Persistence boundary for content and its revision history.
 *
 * One collection, one shape, a `kind` discriminator and an opaque typed payload. The
 * payload is validated on the way in by the schema for that kind and stored whole: a
 * document shape that enumerated the fields of a page, a branch and a fee row at once
 * would be mostly null columns, and none of them would ever be queried.
 *
 * What *is* queried is on the document: kind, slug, status, publish time, locale, tags and
 * the location's coordinates. Those are indexed. Everything else is payload.
 */

import { type PublishStatus, type Seo } from '@reliance/contracts';

import { type ContentKind } from './cms.constants.js';

export interface ContentRecord {
  /** Public id, `doc_…`. */
  readonly id: string;
  readonly kind: ContentKind;
  /** Unique within a kind. The URL a page or post is served at. */
  readonly slug: string;
  readonly title: string;
  readonly status: PublishStatus;
  readonly locale: string;
  readonly seo: Seo | null;
  /** Kind-specific body, validated by that kind's schema before it lands here. */
  readonly payload: Record<string, unknown>;
  readonly tags: readonly string[];
  /** Ordering within a listing — FAQs and fee rows are curated, not alphabetical. */
  readonly order: number;
  /** Latitude in microdegrees. Only set on a `LOCATION`. */
  readonly latitudeMicro: number | null;
  readonly longitudeMicro: number | null;
  /** When a `SCHEDULED` document goes live. */
  readonly scheduledFor: Date | null;
  readonly publishedAt: Date | null;
  readonly revision: number;
  readonly updatedBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type NewContent = Omit<
  ContentRecord,
  'id' | 'revision' | 'publishedAt' | 'createdAt' | 'updatedAt'
>;

/** The fields an editor may change. Kind and slug are set once. */
export interface ContentPatch {
  readonly title?: string;
  readonly seo?: Seo | null;
  readonly payload?: Record<string, unknown>;
  readonly tags?: readonly string[];
  readonly order?: number;
  readonly latitudeMicro?: number | null;
  readonly longitudeMicro?: number | null;
}

export interface ContentQuery {
  readonly kind?: ContentKind;
  readonly status?: PublishStatus;
  readonly locale?: string;
  readonly tag?: string;
  readonly search?: string;
  readonly limit: number;
  readonly offset: number;
}

/** A point-in-time copy, taken before every change. */
export interface RevisionRecord {
  readonly documentId: string;
  readonly revision: number;
  readonly title: string;
  readonly status: PublishStatus;
  readonly seo: Seo | null;
  readonly payload: Record<string, unknown>;
  readonly tags: readonly string[];
  readonly savedBy: string | null;
  readonly savedAt: Date;
  /** Why the change was made, when the editor said. */
  readonly note: string | null;
}

export interface StatusChange {
  readonly id: string;
  readonly status: PublishStatus;
  readonly scheduledFor: Date | null;
  readonly publishedAt: Date | null;
  readonly at: Date;
  readonly by: string | null;
}

export abstract class ContentStore {
  abstract insert(content: NewContent, at: Date): Promise<ContentRecord>;

  abstract findDocument(id: string): Promise<ContentRecord | null>;

  /** Serves a public read: kind plus slug, and only when published. */
  abstract findPublished(kind: ContentKind, slug: string): Promise<ContentRecord | null>;

  abstract findBySlug(kind: ContentKind, slug: string): Promise<ContentRecord | null>;

  abstract list(query: ContentQuery): Promise<{ records: ContentRecord[]; total: number }>;

  /** Published documents of a kind, in curated order. The public listing endpoints' query. */
  abstract listPublished(kind: ContentKind, limit: number): Promise<ContentRecord[]>;

  /** Published locations inside a bounding box, for the proximity search. */
  abstract listInBoundingBox(box: {
    minLatitudeMicro: number;
    maxLatitudeMicro: number;
    minLongitudeMicro: number;
    maxLongitudeMicro: number;
  }): Promise<ContentRecord[]>;

  abstract patch(
    id: string,
    patch: ContentPatch,
    at: Date,
    by: string | null,
  ): Promise<ContentRecord | null>;

  abstract applyStatus(change: StatusChange): Promise<ContentRecord | null>;

  /** Scheduled documents whose time has come. */
  abstract findDueForPublishing(now: Date, limit: number): Promise<ContentRecord[]>;

  abstract remove(id: string): Promise<boolean>;

  // --- Revisions --------------------------------------------------------

  abstract saveRevision(revision: RevisionRecord): Promise<void>;

  abstract listRevisions(documentId: string, limit: number): Promise<RevisionRecord[]>;

  abstract findRevision(documentId: string, revision: number): Promise<RevisionRecord | null>;

  /** Drops revisions older than the newest `keep`, so history does not grow without bound. */
  abstract pruneRevisions(documentId: string, keep: number): Promise<number>;
}
