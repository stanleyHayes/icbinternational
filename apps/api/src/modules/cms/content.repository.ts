import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, type QueryFilter } from 'mongoose';

import { PublishStatus } from '@reliance/contracts';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { BaseRepository } from '../../database/base.repository.js';

import { CONTENT_MODEL, REVISION_MODEL, type ContentKind } from './cms.constants.js';
import { type ContentSchemaClass, type RevisionSchemaClass } from './content.schema.js';
import {
  ContentStore,
  type ContentPatch,
  type ContentQuery,
  type ContentRecord,
  type NewContent,
  type RevisionRecord,
  type StatusChange,
} from './content.store.js';

/** Mongo-backed content store and revision history. */
@Injectable()
export class ContentRepository extends BaseRepository<ContentSchemaClass> implements ContentStore {
  constructor(
    @InjectModel(CONTENT_MODEL) model: Model<ContentSchemaClass>,
    @InjectModel(REVISION_MODEL) private readonly revisions: Model<RevisionSchemaClass>,
    private readonly ids: IdGenerator,
  ) {
    super(model);
  }

  async insert(content: NewContent, at: Date): Promise<ContentRecord> {
    const created = await this.create({
      ...content,
      id: this.ids.generate('document'),
      revision: 1,
      publishedAt: null,
      createdAt: at,
    });
    return toRecord(created.toObject());
  }

  async findDocument(id: string): Promise<ContentRecord | null> {
    const found = await this.findOne({ id });
    return found ? toRecord(found.toObject()) : null;
  }

  async findPublished(kind: ContentKind, slug: string): Promise<ContentRecord | null> {
    const found = await this.findOne({ kind, slug, status: PublishStatus.PUBLISHED });
    return found ? toRecord(found.toObject()) : null;
  }

  async findBySlug(kind: ContentKind, slug: string): Promise<ContentRecord | null> {
    const found = await this.findOne({ kind, slug });
    return found ? toRecord(found.toObject()) : null;
  }

  async list(query: ContentQuery): Promise<{ records: ContentRecord[]; total: number }> {
    const filter = buildFilter(query);

    const [found, total] = await Promise.all([
      this.find(filter, {
        sort: { order: 1, updatedAt: -1 },
        limit: query.limit,
        skip: query.offset,
      }),
      this.count(filter),
    ]);

    return { records: found.map((document) => toRecord(document.toObject())), total };
  }

  async listPublished(kind: ContentKind, limit: number): Promise<ContentRecord[]> {
    const found = await this.find(
      { kind, status: PublishStatus.PUBLISHED },
      { sort: { order: 1, publishedAt: -1 }, limit },
    );
    return found.map((document) => toRecord(document.toObject()));
  }

  async listInBoundingBox(box: {
    minLatitudeMicro: number;
    maxLatitudeMicro: number;
    minLongitudeMicro: number;
    maxLongitudeMicro: number;
  }): Promise<ContentRecord[]> {
    const found = await this.find({
      status: PublishStatus.PUBLISHED,
      latitudeMicro: { $gte: box.minLatitudeMicro, $lte: box.maxLatitudeMicro },
      longitudeMicro: { $gte: box.minLongitudeMicro, $lte: box.maxLongitudeMicro },
    } as QueryFilter<ContentSchemaClass>);

    return found.map((document) => toRecord(document.toObject()));
  }

  async patch(
    id: string,
    patch: ContentPatch,
    at: Date,
    by: string | null,
  ): Promise<ContentRecord | null> {
    const changed = await this.updateById(id, {
      $set: { ...definedOnly(patch), updatedAt: at, updatedBy: by },
      $inc: { revision: 1 },
    });
    return changed ? toRecord(changed.toObject()) : null;
  }

  async applyStatus(change: StatusChange): Promise<ContentRecord | null> {
    const changed = await this.updateById(change.id, {
      $set: {
        status: change.status,
        scheduledFor: change.scheduledFor,
        publishedAt: change.publishedAt,
        updatedAt: change.at,
        updatedBy: change.by,
      },
    });
    return changed ? toRecord(changed.toObject()) : null;
  }

  async findDueForPublishing(now: Date, limit: number): Promise<ContentRecord[]> {
    const found = await this.find(
      { status: PublishStatus.SCHEDULED, scheduledFor: { $ne: null, $lte: now } },
      { sort: { scheduledFor: 1 }, limit },
    );
    return found.map((document) => toRecord(document.toObject()));
  }

  async remove(id: string): Promise<boolean> {
    return this.deleteById(id);
  }

  async saveRevision(revision: RevisionRecord): Promise<void> {
    // The array overload of `create()` is the one whose typing accepts a plain object for
    // a generic document; the single-argument form insists on a hydrated shape.
    await this.revisions.create([{ ...revision, tags: [...revision.tags] }]);
  }

  async listRevisions(documentId: string, limit: number): Promise<RevisionRecord[]> {
    const found = await this.revisions
      .find({ documentId })
      .sort({ revision: -1 })
      .limit(limit)
      .exec();
    return found.map((document) => toRevision(document.toObject()));
  }

  async findRevision(documentId: string, revision: number): Promise<RevisionRecord | null> {
    const found = await this.revisions.findOne({ documentId, revision }).exec();
    return found ? toRevision(found.toObject()) : null;
  }

  /**
   * Keeps the newest `keep` revisions.
   *
   * Two queries rather than one: the boundary revision number has to be known before the
   * delete, and a single `deleteMany` with a skip is not expressible. History is pruned
   * rarely, so the extra round trip costs nothing worth optimising.
   */
  async pruneRevisions(documentId: string, keep: number): Promise<number> {
    const newest = await this.revisions
      .find({ documentId })
      .sort({ revision: -1 })
      .skip(keep)
      .limit(1)
      .exec();

    const boundary = newest[0]?.revision;
    if (boundary === undefined) return 0;

    const result = await this.revisions
      .deleteMany({ documentId, revision: { $lte: boundary } })
      .exec();

    return result.deletedCount;
  }
}

function buildFilter(query: ContentQuery): QueryFilter<ContentSchemaClass> {
  const filter: Record<string, unknown> = {};
  if (query.kind) filter.kind = query.kind;
  if (query.status) filter.status = query.status;
  if (query.locale) filter.locale = query.locale;
  if (query.tag) filter.tags = query.tag;
  if (query.search) {
    // Anchored prefix match on the title. A regular expression without an anchor cannot
    // use the index and turns a content listing into a collection scan.
    filter.title = { $regex: `^${escapeRegex(query.search)}`, $options: 'i' };
  }
  return filter as QueryFilter<ContentSchemaClass>;
}

function escapeRegex(value: string): string {
  return value.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);
}

/** Drops `undefined` entries so a partial patch does not blank an unmentioned field. */
function definedOnly(patch: ContentPatch): Record<string, unknown> {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
}

function toRecord(document: ContentSchemaClass): ContentRecord {
  return {
    id: document.id,
    kind: document.kind,
    slug: document.slug,
    title: document.title,
    status: document.status,
    locale: document.locale,
    seo: document.seo,
    payload: document.payload,
    tags: document.tags,
    order: document.order,
    latitudeMicro: document.latitudeMicro,
    longitudeMicro: document.longitudeMicro,
    scheduledFor: document.scheduledFor,
    publishedAt: document.publishedAt,
    revision: document.revision,
    updatedBy: document.updatedBy,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function toRevision(document: RevisionSchemaClass): RevisionRecord {
  return {
    documentId: document.documentId,
    revision: document.revision,
    title: document.title,
    status: document.status,
    seo: document.seo,
    payload: document.payload,
    tags: document.tags,
    savedBy: document.savedBy,
    savedAt: document.savedAt,
    note: document.note,
  };
}
