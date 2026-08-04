import { Injectable } from '@nestjs/common';

import { PublishStatus } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { IdGenerator } from '../../common/ids/id-generator.js';

import { type ContentKind } from './cms.constants.js';
import {
  ContentStore,
  type ContentPatch,
  type ContentQuery,
  type ContentRecord,
  type NewContent,
  type RevisionRecord,
  type StatusChange,
} from './content.store.js';

/**
 * In-process content store.
 *
 * Enforces the same `{kind, slug}` uniqueness the Mongo index does, so a test that creates
 * two pages at the same address fails here exactly as it would in production. Used by the
 * public-boundary test, which needs published and unpublished content without a database.
 */
@Injectable()
export class InMemoryContentStore extends ContentStore {
  private readonly byId = new Map<string, ContentRecord>();
  private readonly revisions: RevisionRecord[] = [];

  constructor(
    private readonly ids: IdGenerator = new IdGenerator(),
    private readonly clock: ClockService = new ClockService(),
  ) {
    super();
  }

  override async insert(content: NewContent, at: Date): Promise<ContentRecord> {
    const clash = await this.findBySlug(content.kind, content.slug);
    if (clash) throw new Error(`A ${content.kind} already exists at ${content.slug}`);

    const record: ContentRecord = {
      ...content,
      id: this.ids.generate('document'),
      revision: 1,
      publishedAt: null,
      createdAt: at,
      updatedAt: at,
    };
    this.byId.set(record.id, record);
    return record;
  }

  override async findDocument(id: string): Promise<ContentRecord | null> {
    return this.byId.get(id) ?? null;
  }

  override async findPublished(kind: ContentKind, slug: string): Promise<ContentRecord | null> {
    const found = await this.findBySlug(kind, slug);
    return found?.status === PublishStatus.PUBLISHED ? found : null;
  }

  override async findBySlug(kind: ContentKind, slug: string): Promise<ContentRecord | null> {
    return (
      [...this.byId.values()].find((record) => record.kind === kind && record.slug === slug) ?? null
    );
  }

  override async list(query: ContentQuery): Promise<{ records: ContentRecord[]; total: number }> {
    const matched = [...this.byId.values()]
      .filter((record) => !query.kind || record.kind === query.kind)
      .filter((record) => !query.status || record.status === query.status)
      .filter((record) => !query.locale || record.locale === query.locale)
      .filter((record) => !query.tag || record.tags.includes(query.tag))
      .filter((record) => matchesSearch(record, query.search))
      .sort(byOrderThenRecency);

    return {
      records: matched.slice(query.offset, query.offset + query.limit),
      total: matched.length,
    };
  }

  override async listPublished(kind: ContentKind, limit: number): Promise<ContentRecord[]> {
    return [...this.byId.values()]
      .filter((record) => record.kind === kind && record.status === PublishStatus.PUBLISHED)
      .sort(byOrderThenRecency)
      .slice(0, limit);
  }

  override async listInBoundingBox(box: {
    minLatitudeMicro: number;
    maxLatitudeMicro: number;
    minLongitudeMicro: number;
    maxLongitudeMicro: number;
  }): Promise<ContentRecord[]> {
    return [...this.byId.values()].filter(
      (record) =>
        record.status === PublishStatus.PUBLISHED &&
        record.latitudeMicro !== null &&
        record.longitudeMicro !== null &&
        record.latitudeMicro >= box.minLatitudeMicro &&
        record.latitudeMicro <= box.maxLatitudeMicro &&
        record.longitudeMicro >= box.minLongitudeMicro &&
        record.longitudeMicro <= box.maxLongitudeMicro,
    );
  }

  override async patch(
    id: string,
    patch: ContentPatch,
    at: Date,
    by: string | null,
  ): Promise<ContentRecord | null> {
    const record = this.byId.get(id);
    if (!record) return null;

    const defined = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );

    const next: ContentRecord = {
      ...record,
      ...defined,
      revision: record.revision + 1,
      updatedAt: at,
      updatedBy: by,
    };

    this.byId.set(id, next);
    return next;
  }

  override async applyStatus(change: StatusChange): Promise<ContentRecord | null> {
    const record = this.byId.get(change.id);
    if (!record) return null;

    const next: ContentRecord = {
      ...record,
      status: change.status,
      scheduledFor: change.scheduledFor,
      publishedAt: change.publishedAt,
      updatedAt: change.at,
      updatedBy: change.by,
    };

    this.byId.set(change.id, next);
    return next;
  }

  override async findDueForPublishing(now: Date, limit: number): Promise<ContentRecord[]> {
    return [...this.byId.values()]
      .filter(
        (record) =>
          record.status === PublishStatus.SCHEDULED &&
          record.scheduledFor !== null &&
          record.scheduledFor.getTime() <= now.getTime(),
      )
      .slice(0, limit);
  }

  override async remove(id: string): Promise<boolean> {
    return this.byId.delete(id);
  }

  override async saveRevision(revision: RevisionRecord): Promise<void> {
    this.revisions.push(revision);
  }

  override async listRevisions(documentId: string, limit: number): Promise<RevisionRecord[]> {
    return this.revisions
      .filter((entry) => entry.documentId === documentId)
      .sort((left, right) => right.revision - left.revision)
      .slice(0, limit);
  }

  override async findRevision(
    documentId: string,
    revision: number,
  ): Promise<RevisionRecord | null> {
    return (
      this.revisions.find(
        (entry) => entry.documentId === documentId && entry.revision === revision,
      ) ?? null
    );
  }

  override async pruneRevisions(documentId: string, keep: number): Promise<number> {
    const owned = this.revisions
      .filter((entry) => entry.documentId === documentId)
      .sort((left, right) => right.revision - left.revision);

    const doomed = new Set(owned.slice(keep));
    if (doomed.size === 0) return 0;

    for (const entry of doomed) this.revisions.splice(this.revisions.indexOf(entry), 1);
    return doomed.size;
  }

  /** Test affordance: the clock this twin stamps records with. */
  get now(): Date {
    return this.clock.now();
  }
}

function matchesSearch(record: ContentRecord, search: string | undefined): boolean {
  if (!search) return true;
  return record.title.toLowerCase().startsWith(search.toLowerCase());
}

function byOrderThenRecency(left: ContentRecord, right: ContentRecord): number {
  const byOrder = left.order - right.order;
  return byOrder === 0 ? right.updatedAt.getTime() - left.updatedAt.getTime() : byOrder;
}
