/**
 * Content record → the staff-facing shapes.
 *
 * Separate from `content.mapper.ts` because the two audiences want different things: the
 * public gets a rendered page, staff get the workflow state, the revision number and the
 * raw payload they are editing.
 */

import { type ContentDetail, type ContentSummary, type RevisionSummary } from './cms.dto.js';
import { type ContentRecord, type RevisionRecord } from './content.store.js';
import { availableActions } from './publishing/workflow.js';

export function toContentSummary(record: ContentRecord): ContentSummary {
  return {
    id: record.id,
    kind: record.kind,
    slug: record.slug,
    title: record.title,
    status: record.status,
    locale: record.locale,
    tags: [...record.tags],
    order: record.order,
    revision: record.revision,
    scheduledFor: record.scheduledFor?.toISOString() ?? null,
    publishedAt: record.publishedAt?.toISOString() ?? null,
    updatedAt: record.updatedAt.toISOString(),
    updatedBy: record.updatedBy,
    availableActions: availableActions(record.status),
  };
}

export function toContentDetail(record: ContentRecord): ContentDetail {
  return {
    ...toContentSummary(record),
    seo: record.seo,
    payload: record.payload,
    latitudeMicro: record.latitudeMicro,
    longitudeMicro: record.longitudeMicro,
  };
}

export function toRevisionSummary(revision: RevisionRecord): RevisionSummary {
  return {
    revision: revision.revision,
    title: revision.title,
    status: revision.status,
    savedBy: revision.savedBy,
    savedAt: revision.savedAt.toISOString(),
    note: revision.note,
  };
}
