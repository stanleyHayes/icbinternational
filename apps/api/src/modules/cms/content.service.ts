/**
 * Creating, editing and reading content.
 *
 * Every change takes a revision *before* it applies. That ordering is the whole point: a
 * rollback needs the state the document was in, and a snapshot taken afterwards records
 * the state you are trying to get back from.
 */

import { Injectable } from '@nestjs/common';

import { ErrorCode, PublishStatus, type Seo } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';

import { MAX_REVISIONS, type ContentKind } from './cms.constants.js';
import {
  ContentStore,
  type ContentPatch,
  type ContentQuery,
  type ContentRecord,
  type RevisionRecord,
} from './content.store.js';

export interface CreateContentInput {
  readonly kind: ContentKind;
  readonly slug: string;
  readonly title: string;
  readonly locale?: string;
  readonly seo?: Seo | null;
  readonly payload: Record<string, unknown>;
  readonly tags?: readonly string[];
  readonly order?: number;
  readonly latitudeMicro?: number | null;
  readonly longitudeMicro?: number | null;
  readonly by: string | null;
}

export interface UpdateContentInput {
  readonly id: string;
  readonly patch: ContentPatch;
  readonly by: string | null;
  /** Why the change was made. Shown beside the revision in the history. */
  readonly note?: string;
}

const DEFAULT_LOCALE = 'en-GB';

@Injectable()
export class ContentService {
  constructor(
    private readonly content: ContentStore,
    private readonly clock: ClockService,
  ) {}

  /** @throws {AppError} `CONFLICT` when that kind already has a document at that slug. */
  async create(input: CreateContentInput): Promise<ContentRecord> {
    const existing = await this.content.findBySlug(input.kind, input.slug);
    if (existing) {
      throw AppError.conflict(
        ErrorCode.CONFLICT,
        `There is already a ${input.kind.toLowerCase()} at "${input.slug}".`,
      );
    }

    return this.content.insert(
      {
        kind: input.kind,
        slug: input.slug,
        title: input.title,
        status: PublishStatus.DRAFT,
        locale: input.locale ?? DEFAULT_LOCALE,
        seo: input.seo ?? null,
        payload: input.payload,
        tags: input.tags ?? [],
        order: input.order ?? 0,
        latitudeMicro: input.latitudeMicro ?? null,
        longitudeMicro: input.longitudeMicro ?? null,
        scheduledFor: null,
        updatedBy: input.by,
      },
      this.clock.now(),
    );
  }

  /**
   * Applies an edit, snapshotting the previous state first.
   *
   * @throws {AppError} `NOT_FOUND` when there is no such document.
   */
  async update(input: UpdateContentInput): Promise<ContentRecord> {
    const current = await this.load(input.id);
    await this.snapshot(current, input.by, input.note ?? null);

    const updated = await this.content.patch(input.id, input.patch, this.clock.now(), input.by);
    if (!updated) throw AppError.notFound('Content', input.id);

    await this.content.pruneRevisions(input.id, MAX_REVISIONS);
    return updated;
  }

  /**
   * Restores a document to an earlier revision.
   *
   * The restore is itself an edit: the current state is snapshotted first, so rolling back
   * is undoable. History only ever grows forward — nothing is rewritten, which is the same
   * discipline the ledger applies to a reversal.
   *
   * @throws {AppError} `NOT_FOUND` when the document or the revision does not exist.
   */
  async rollback(input: {
    id: string;
    revision: number;
    by: string | null;
  }): Promise<ContentRecord> {
    const target = await this.content.findRevision(input.id, input.revision);
    if (!target) throw AppError.notFound('Revision', `${input.id}@${input.revision}`);

    return this.update({
      id: input.id,
      by: input.by,
      note: `Restored revision ${input.revision}`,
      patch: {
        title: target.title,
        seo: target.seo,
        payload: target.payload,
        tags: target.tags,
      },
    });
  }

  async get(id: string): Promise<ContentRecord> {
    return this.load(id);
  }

  async findPublished(kind: ContentKind, slug: string): Promise<ContentRecord | null> {
    return this.content.findPublished(kind, slug);
  }

  async listPublished(kind: ContentKind, limit: number): Promise<ContentRecord[]> {
    return this.content.listPublished(kind, limit);
  }

  async list(query: ContentQuery): Promise<{ records: ContentRecord[]; total: number }> {
    return this.content.list(query);
  }

  async history(id: string): Promise<RevisionRecord[]> {
    await this.load(id);
    return this.content.listRevisions(id, MAX_REVISIONS);
  }

  /** Removes a document outright. Only reachable for a draft that was never published. */
  async remove(id: string): Promise<void> {
    const current = await this.load(id);

    if (current.publishedAt) {
      throw new AppError({
        code: ErrorCode.CONFLICT,
        message: 'Published content is archived rather than deleted, so the record survives.',
      });
    }

    await this.content.remove(id);
  }

  private async load(id: string): Promise<ContentRecord> {
    const found = await this.content.findDocument(id);
    if (!found) throw AppError.notFound('Content', id);
    return found;
  }

  private async snapshot(
    record: ContentRecord,
    by: string | null,
    note: string | null,
  ): Promise<void> {
    await this.content.saveRevision({
      documentId: record.id,
      revision: record.revision,
      title: record.title,
      status: record.status,
      seo: record.seo,
      payload: record.payload,
      tags: record.tags,
      savedBy: by,
      savedAt: this.clock.now(),
      note,
    });
  }
}
